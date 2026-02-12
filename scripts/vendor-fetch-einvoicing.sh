#!/bin/bash
# vendor-fetch-einvoicing.sh
# Fetch and vendor official EN16931 + XRechnung validation artifacts from GitHub releases
#
# Usage:
#   ./scripts/vendor-fetch-einvoicing.sh [--force]
#
# Environment overrides (optional):
#   EN16931_TAG=validation-1.3.15 \
#   KOSIT_VALIDATOR_TAG=v1.6.1 \
#   XRECHNUNG_CONFIG_TAG=v2026-01-31 \
#   XRECHNUNG_SCHEMATRON_TAG=v2.5.0 \
#   ./scripts/vendor-fetch-einvoicing.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$REPO_ROOT/vendor/einvoicing"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Resolve latest tag from GitHub API if not provided
resolve_latest_tag() {
    local repo=$1
    local tag_var=$2
    local tag_value="${!tag_var:-}"

    if [[ -n "$tag_value" ]]; then
        echo "$tag_value"
        return
    fi

    log_info "Resolving latest tag for $repo..."
    local latest_tag
    latest_tag=$(curl -s "https://api.github.com/repos/$repo/releases/latest" | grep '"tag_name":' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/')

    if [[ -z "$latest_tag" ]]; then
        log_error "Failed to resolve latest tag for $repo"
        exit 1
    fi

    echo "$latest_tag"
}

# Fetch release metadata from GitHub API
fetch_release_metadata() {
    local repo=$1
    local tag=$2

    log_info "Fetching release metadata for $repo @ $tag..."
    curl -s "https://api.github.com/repos/$repo/releases/tags/$tag"
}

# Download asset from release
download_asset() {
    local url=$1
    local dest=$2

    log_info "Downloading $(basename "$dest")..."
    curl -L -o "$dest" "$url"
}

# Extract zip and clean up
extract_and_verify() {
    local zip_path=$1
    local extract_dir=$2

    log_info "Extracting $(basename "$zip_path")..."
    mkdir -p "$extract_dir"
    unzip -q -o "$zip_path" -d "$extract_dir"
}

# Generate checksums
generate_checksums() {
    local dir=$1
    shift
    local files=("$@")

    log_info "Generating SHA256 checksums..."
    (
        cd "$dir"
        sha256sum "${files[@]}" > checksums.sha256
    )
}

# Write SOURCE.md
write_source_md() {
    local dest=$1
    local repo=$2
    local tag=$3
    local release_date=$4
    local published_at=$5
    shift 5
    local assets=("$@")

    cat > "$dest" <<EOF
# $(basename "$(dirname "$dest")")

## Source
- **Repository**: $repo
- **Release URL**: https://github.com/$repo/releases/tag/$tag
- **Tag**: $tag
- **Release Date**: $release_date
- **Published**: $published_at

## Assets Downloaded
EOF

    local i=1
    for asset in "${assets[@]}"; do
        local asset_name=$(basename "$asset")
        local checksum=$(sha256sum "$asset" | awk '{print $1}')
        echo "$i. \`$asset_name\` ($(stat -c%s "$asset" 2>/dev/null || stat -f%z "$asset") bytes)" >> "$dest"
        echo "   - SHA256: \`$checksum\`" >> "$dest"
        ((i++))
    done

    echo "" >> "$dest"
    echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$dest"
}

# Main fetch logic
main() {
    log_info "Starting vendor fetch for EN16931 + XRechnung artifacts..."

    # Resolve tags
    EN16931_TAG=$(resolve_latest_tag "ConnectingEurope/eInvoicing-EN16931" "EN16931_TAG")
    KOSIT_VALIDATOR_TAG=$(resolve_latest_tag "itplr-kosit/validator" "KOSIT_VALIDATOR_TAG")
    XRECHNUNG_CONFIG_TAG=$(resolve_latest_tag "itplr-kosit/validator-configuration-xrechnung" "XRECHNUNG_CONFIG_TAG")
    XRECHNUNG_SCHEMATRON_TAG=$(resolve_latest_tag "itplr-kosit/xrechnung-schematron" "XRECHNUNG_SCHEMATRON_TAG")

    log_success "Resolved tags:"
    echo "  EN16931: $EN16931_TAG"
    echo "  KoSIT Validator: $KOSIT_VALIDATOR_TAG"
    echo "  XRechnung Config: $XRECHNUNG_CONFIG_TAG"
    echo "  XRechnung Schematron: $XRECHNUNG_SCHEMATRON_TAG"

    # Create vendor structure
    mkdir -p "$VENDOR_DIR"/{en16931,kosit/{validator,xrechnung-config,xrechnung-schematron}}

    # === EN16931 ===
    log_info "Processing EN16931 artifacts..."
    EN16931_DIR="$VENDOR_DIR/en16931/$EN16931_TAG"
    mkdir -p "$EN16931_DIR"

    download_asset \
        "https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/$EN16931_TAG/en16931-cii-${EN16931_TAG#validation-}.zip" \
        "$EN16931_DIR/en16931-cii.zip"
    download_asset \
        "https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/$EN16931_TAG/en16931-ubl-${EN16931_TAG#validation-}.zip" \
        "$EN16931_DIR/en16931-ubl.zip"

    extract_and_verify "$EN16931_DIR/en16931-cii.zip" "$EN16931_DIR"
    extract_and_verify "$EN16931_DIR/en16931-ubl.zip" "$EN16931_DIR"
    generate_checksums "$EN16931_DIR" "en16931-cii.zip" "en16931-ubl.zip"

    # === KoSIT Validator ===
    log_info "Processing KoSIT Validator..."
    VALIDATOR_DIR="$VENDOR_DIR/kosit/validator/$KOSIT_VALIDATOR_TAG"
    mkdir -p "$VALIDATOR_DIR"

    download_asset \
        "https://github.com/itplr-kosit/validator/releases/download/$KOSIT_VALIDATOR_TAG/validator-${KOSIT_VALIDATOR_TAG#v}-standalone.jar" \
        "$VALIDATOR_DIR/validator-${KOSIT_VALIDATOR_TAG#v}-standalone.jar"

    generate_checksums "$VALIDATOR_DIR" "validator-${KOSIT_VALIDATOR_TAG#v}-standalone.jar"

    # === XRechnung Config ===
    log_info "Processing XRechnung Validator Configuration..."
    CONFIG_DIR="$VENDOR_DIR/kosit/xrechnung-config/$XRECHNUNG_CONFIG_TAG"
    mkdir -p "$CONFIG_DIR"

    download_asset \
        "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/$XRECHNUNG_CONFIG_TAG/xrechnung-3.0.2-validator-configuration-${XRECHNUNG_CONFIG_TAG#v}.zip" \
        "$CONFIG_DIR/xrechnung-config.zip"

    extract_and_verify "$CONFIG_DIR/xrechnung-config.zip" "$CONFIG_DIR"
    generate_checksums "$CONFIG_DIR" "xrechnung-config.zip"

    if [[ -f "$CONFIG_DIR/scenarios.xml" ]]; then
        log_success "✓ scenarios.xml verified"
    else
        log_error "✗ scenarios.xml NOT found in extracted config!"
        exit 1
    fi

    # === XRechnung Schematron ===
    log_info "Processing XRechnung Schematron..."
    SCHEMATRON_DIR="$VENDOR_DIR/kosit/xrechnung-schematron/$XRECHNUNG_SCHEMATRON_TAG"
    mkdir -p "$SCHEMATRON_DIR"

    download_asset \
        "https://github.com/itplr-kosit/xrechnung-schematron/releases/download/$XRECHNUNG_SCHEMATRON_TAG/xrechnung-3.0.2-schematron-${XRECHNUNG_SCHEMATRON_TAG#v}.zip" \
        "$SCHEMATRON_DIR/xrechnung-schematron.zip"

    extract_and_verify "$SCHEMATRON_DIR/xrechnung-schematron.zip" "$SCHEMATRON_DIR"
    generate_checksums "$SCHEMATRON_DIR" "xrechnung-schematron.zip"

    log_success "✅ All artifacts fetched successfully!"
    log_info "Vendor artifacts stored in: $VENDOR_DIR"
}

main "$@"
