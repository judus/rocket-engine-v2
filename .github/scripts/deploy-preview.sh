#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_SHA:?Missing checked revision}"
: "${ARCHIVE_SHA256:?Missing checked artifact checksum}"
: "${DEPLOY_HOST:?Missing deployment host}"
: "${DEPLOY_SSH_KEY:?Missing restricted deployment key}"
: "${DEPLOY_KNOWN_HOSTS:?Missing pinned host key}"
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release revision' >&2; exit 1; }
[[ "$ARCHIVE_SHA256" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid artifact checksum' >&2; exit 1; }
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo 'Invalid deployment hostname' >&2; exit 1; }
archive=${1:?Missing checked archive}
[[ -f "$archive" ]] || { echo 'Deployment archive is missing' >&2; exit 1; }
actual=$(sha256sum "$archive" | cut -d ' ' -f 1)
[[ "$actual" == "$ARCHIVE_SHA256" ]] || { echo 'Deployment archive checksum mismatch' >&2; exit 1; }
workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT
chmod 700 "$workspace"
printf '%s\n' "$DEPLOY_SSH_KEY" > "$workspace/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$workspace/known_hosts"
chmod 600 "$workspace/key" "$workspace/known_hosts"
ssh-keygen -y -f "$workspace/key" > /dev/null
options=(-p 22 -l maduser -i "$workspace/key" -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$workspace/known_hosts" -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=20 -o ConnectionAttempts=2)
ssh "${options[@]}" "$DEPLOY_HOST" "upload $RELEASE_SHA $ARCHIVE_SHA256" < "$archive"
ssh "${options[@]}" "$DEPLOY_HOST" "deploy $RELEASE_SHA $ARCHIVE_SHA256"
