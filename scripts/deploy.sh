#!/usr/bin/env bash
# Deploy all Supabase Edge Functions to the project.
# Usage: SUPABASE_ACCESS_TOKEN=... ./deploy.sh
set -euo pipefail

REF="ycsssohaoedyyucldefb"
TOKEN="${SUPABASE_ACCESS_TOKEN:?must be set}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

# Write a minimal supabase/config.toml so the CLI knows the project layout
mkdir -p supabase
if [ ! -f "supabase/config.toml" ]; then
  cat > supabase/config.toml <<'EOF'
project_id = "ycsssohaoedyyucldefb"

[functions.send-otp]
verify_jwt = false
[functions.verify-otp]
verify_jwt = false
[functions.check-username]
verify_jwt = false
[functions.finalize-signup]
verify_jwt = false
[functions.create-post]
verify_jwt = false
[functions.get-posts]
verify_jwt = false
[functions.unlock-post]
verify_jwt = false
[functions.delete-post]
verify_jwt = false
[functions.verify-payment]
verify_jwt = false
[functions.create-razorpay-order]
verify_jwt = false
[functions.book-event]
verify_jwt = false
[functions.update-creator]
verify_jwt = false
[functions.create-event]
verify_jwt = false
EOF
fi

FUNCS=(
  "send-otp" "verify-otp" "check-username" "finalize-signup"
  "create-post" "get-posts" "unlock-post" "delete-post"
  "verify-payment" "create-razorpay-order" "book-event"
  "update-creator" "create-event"
)

for name in "${FUNCS[@]}"; do
  echo "==> Deploying $name ..."
  supabase functions deploy "$name" --project-ref "$REF" --no-verify-jwt 2>&1 | tail -5
  echo
done

echo "==> All functions deployed."
