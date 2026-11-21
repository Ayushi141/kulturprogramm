#!/bin/sh
# Installs a new version of the repository on the server and rebuilds the
# frontend.
#
# GitHub Actions (.github/workflows/deploy.yml) sends the newest main as a
# tar archive over SSH. The deploy key in ~/.ssh/authorized_keys forces this
# command, so the key can do nothing else:
#
#   command="d=$HOME/aggregator; rm -rf $d.new && mkdir $d.new && tar -xzf - -C $d.new && exec sh $d.new/backend/deploy/deploy.sh",restrict ssh-ed25519 AAAA... github-deploy
#
# That command unpacks the archive to ~/aggregator.new and starts this script
# from there. This script replaces ~/aggregator with the new version and
# rebuilds the frontend. The server holds no credentials for the repository.
#
# The scraper is not restarted: it runs its own loop. Rebuild it by hand after
# scraper changes (see "Common operations" in AGENTS.md).
set -eu

# The script moves its own directory. A shell reads a function body
# completely before it calls the function, so the move cannot break it.
main() {
    new=$(cd "$(dirname "$0")/../.." && pwd)
    app=${new%.new}
    rm -rf "$app.old"
    if [ -d "$app" ]; then mv "$app" "$app.old"; fi
    mv "$new" "$app"
    cd "$app/backend/deploy"
    # -p deploy: the same project name (and so the same data volume
    # deploy_pgdata) as when Compose is started by hand from this directory.
    docker compose -p deploy up -d --build frontend
    rm -rf "$app.old"
    docker image prune -f
}

main
exit
