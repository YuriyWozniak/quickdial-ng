# CONTRIBUTING

* Open an issue before larger work, so we can agree on it first
* Branch from `develop` (e.g. `feature/...` or `fix/...`) and open the pull request against `develop`
* Follow [CODE_STYLE.md](CODE_STYLE.md) (formatting and naming) and run `npm run check` and the tests ([test/README.md](test/README.md)) before you open the pull request
* Every push and pull request is checked by [CI](.github/workflows/ci.yml) (lint and types, unit and integration tests, an unsigned package, release notes); the jobs run the same commands, so a failure can be reproduced locally
* A version bump in `src/manifest.json` needs its release notes in [release/amo-listing.md](release/amo-listing.md) (`### <version>` under "Release notes"); `node release/notes.js --check` checks it
