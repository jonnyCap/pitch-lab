#!/usr/bin/env bash
# ==============================================================================
# 🔐 Pitch Lab Sealed Secrets Helper
# Automatically converts your local .env into encrypted SealedSecret YAMLs
# (Application secrets: pitchlab-secret, GHCR Image Pull secrets: ghcr-creds)
# using your cluster's public certificate (pub-sealed-secrets.pem).
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_FILE="${SCRIPT_DIR}/pub-sealed-secrets.pem"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
OUTPUT_FILE="${SCRIPT_DIR}/k8s/sealed-secret.yaml"
BIN_DIR="${SCRIPT_DIR}/.bin"
APP_SECRET_NAME="pitchlab-secret"
GHCR_SECRET_NAME="ghcr-creds"
TARGET_NAMESPACE="pitchlab"

echo -e "${BLUE}================================================================${NC}"
echo -e "${CYAN}🔐 Pitch Lab Sealed Secrets Generator${NC}"
echo -e "${BLUE}================================================================${NC}"

# 1. Ensure public certificate exists
if [ ! -f "$CERT_FILE" ]; then
  echo -e "${RED}[!] Public certificate not found at: ${CERT_FILE}${NC}"
  echo -e "${YELLOW}Please place your pub-sealed-secrets.pem in the repository root.${NC}"
  exit 1
fi

# 2. Ensure kubeseal binary exists (auto-download if missing)
ensure_kubeseal() {
  if command -v kubeseal >/dev/null 2>&1; then
    KUBESEAL_CMD="kubeseal"
    return
  fi

  if [ -x "${BIN_DIR}/kubeseal" ]; then
    KUBESEAL_CMD="${BIN_DIR}/kubeseal"
    return
  fi

  echo -e "${YELLOW}[!] kubeseal not found on PATH. Auto-downloading standalone binary to .bin/...${NC}"
  mkdir -p "${BIN_DIR}"
  
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo -e "${RED}Unsupported arch: $ARCH${NC}"; exit 1 ;;
  esac

  KUBESEAL_VER="0.27.1"
  TARBALL="kubeseal-${KUBESEAL_VER}-${OS}-${ARCH}.tar.gz"
  URL="https://github.com/bitnami-labs/sealed-secrets/releases/download/v${KUBESEAL_VER}/${TARBALL}"

  echo "Downloading kubeseal from ${URL}..."
  curl -sSL "$URL" | tar -xz -C "${BIN_DIR}" kubeseal
  chmod +x "${BIN_DIR}/kubeseal"
  KUBESEAL_CMD="${BIN_DIR}/kubeseal"
  echo -e "${GREEN}[✓] Downloaded kubeseal successfully.${NC}"
}

ensure_kubeseal

# 3. Determine which env file to read
if [ $# -ge 1 ]; then
  ENV_FILE="$1"
elif [ -f "${SCRIPT_DIR}/.env.prod" ]; then
  ENV_FILE="${SCRIPT_DIR}/.env.prod"
elif [ -f "${SCRIPT_DIR}/.env.remote" ]; then
  ENV_FILE="${SCRIPT_DIR}/.env.remote"
elif [ -f "${SCRIPT_DIR}/.env" ]; then
  ENV_FILE="${SCRIPT_DIR}/.env"
elif [ -f "${SCRIPT_DIR}/backend/.env" ]; then
  ENV_FILE="${SCRIPT_DIR}/backend/.env"
else
  echo -e "${RED}[!] No environment file found (.env.prod, .env.remote, or .env).${NC}"
  echo -e "${YELLOW}Create a .env.prod file from .env.prod.example and re-run:${NC}"
  echo -e "    cp .env.prod.example .env.prod"
  echo -e "    ./seal-env.sh .env.prod"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}[!] Specified environment file not found: ${ENV_FILE}${NC}"
  exit 1
fi

echo -e "${CYAN}[i] Reading configuration from: ${ENV_FILE}${NC}"
echo -e "${CYAN}[i] Target Namespace: ${TARGET_NAMESPACE}${NC}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TMP_APP_SECRET="${TMP_DIR}/app-secret.yaml"
TMP_GHCR_SECRET="${TMP_DIR}/ghcr-secret.yaml"
FINAL_OUTPUT="${TMP_DIR}/sealed-secret.yaml"

# 4. Parse .env file
GHCR_PAT=""
GHCR_USERNAME=""
GHCR_EMAIL=""

APP_DATA_FILE="${TMP_DIR}/app_data.txt"
touch "$APP_DATA_FILE"

while IFS= read -r line || [ -n "$line" ]; do
  # Trim whitespace
  trimmed=$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  if [[ -z "$trimmed" || "$trimmed" == \#* ]]; then
    continue
  fi

  # Split key and value
  key=$(echo "$trimmed" | cut -d '=' -f 1 | xargs)
  val=$(echo "$trimmed" | cut -d '=' -f 2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")

  # Detect GHCR specific variables
  case "$key" in
    GHCR_PAT|GHCR_TOKEN|GITHUB_PAT|GITHUB_TOKEN)
      GHCR_PAT="$val"
      continue
      ;;
    GHCR_USERNAME|GHCR_USER|GITHUB_ACTOR|GITHUB_USERNAME|GITHUB_USER)
      GHCR_USERNAME="$val"
      continue
      ;;
    GHCR_EMAIL|GITHUB_EMAIL)
      GHCR_EMAIL="$val"
      continue
      ;;
  esac

  # Add to app stringData
  printf "  %s: %s\n" "$key" "$val" >> "$APP_DATA_FILE"
done < "$ENV_FILE"

# 5. Generate and Seal Application Secret (pitchlab-secret)
cat <<EOF > "$TMP_APP_SECRET"
apiVersion: v1
kind: Secret
metadata:
  name: ${APP_SECRET_NAME}
  namespace: ${TARGET_NAMESPACE}
type: Opaque
stringData:
EOF
cat "$APP_DATA_FILE" >> "$TMP_APP_SECRET"

echo -e "${CYAN}[i] Sealing application secret: ${APP_SECRET_NAME}...${NC}"
"$KUBESEAL_CMD" \
  --format yaml \
  --cert "$CERT_FILE" \
  --scope strict \
  < "$TMP_APP_SECRET" > "$FINAL_OUTPUT"

echo -e "${GREEN}[✓] Application secret (${APP_SECRET_NAME}) sealed successfully.${NC}"

# 6. Generate and Seal GHCR Registry Secret (ghcr-creds) if GHCR_PAT is provided
if [ -n "$GHCR_PAT" ]; then
  # Fallback to repository owner or 'jonnycap' if username not specified
  if [ -z "$GHCR_USERNAME" ]; then
    GHCR_USERNAME="jonnycap"
  fi

  echo -e "${CYAN}[i] GHCR PAT found for user '${GHCR_USERNAME}'. Sealing ${GHCR_SECRET_NAME}...${NC}"

  # Base64 encode credentials for dockerconfigjson
  AUTH_B64=$(printf "%s:%s" "$GHCR_USERNAME" "$GHCR_PAT" | base64 | tr -d '\r\n')

  if [ -n "$GHCR_EMAIL" ]; then
    DOCKER_CONFIG_JSON="{\"auths\":{\"ghcr.io\":{\"username\":\"${GHCR_USERNAME}\",\"password\":\"${GHCR_PAT}\",\"email\":\"${GHCR_EMAIL}\",\"auth\":\"${AUTH_B64}\"}}}"
  else
    DOCKER_CONFIG_JSON="{\"auths\":{\"ghcr.io\":{\"username\":\"${GHCR_USERNAME}\",\"password\":\"${GHCR_PAT}\",\"auth\":\"${AUTH_B64}\"}}}"
  fi

  cat <<EOF > "$TMP_GHCR_SECRET"
apiVersion: v1
kind: Secret
metadata:
  name: ${GHCR_SECRET_NAME}
  namespace: ${TARGET_NAMESPACE}
type: kubernetes.io/dockerconfigjson
stringData:
  .dockerconfigjson: '${DOCKER_CONFIG_JSON}'
EOF

  # Seal GHCR secret and append to final output
  echo "" >> "$FINAL_OUTPUT"
  "$KUBESEAL_CMD" \
    --format yaml \
    --cert "$CERT_FILE" \
    --scope strict \
    < "$TMP_GHCR_SECRET" >> "$FINAL_OUTPUT"

  echo -e "${GREEN}[✓] GHCR image pull secret (${GHCR_SECRET_NAME}) sealed successfully.${NC}"
else
  echo -e "${YELLOW}[i] No GHCR_PAT specified in ${ENV_FILE}.${NC}"
  echo -e "${YELLOW}    To enable pulling private images from ghcr.io, set GHCR_PAT in your .env file.${NC}"
fi

# 7. Write to output file
cp "$FINAL_OUTPUT" "$OUTPUT_FILE"

echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}[✓] Sealed secrets saved to:${NC} ${OUTPUT_FILE}"
echo -e "${BLUE}================================================================${NC}"

# 8. Make sure kustomize picks up the sealed secret
KUSTOMIZATION="${SCRIPT_DIR}/k8s/kustomization.yaml"
if grep -q '^  # - sealed-secret.yaml' "$KUSTOMIZATION"; then
  sed -i 's|^  # - sealed-secret.yaml|  - sealed-secret.yaml|' "$KUSTOMIZATION"
  echo -e "${GREEN}[✓] Enabled sealed-secret.yaml in k8s/kustomization.yaml${NC}"
fi
