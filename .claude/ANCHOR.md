# Anchor Circle

Authored by the human Lead Link. Read by `governance` (clause 12
forbids modification). Never overwritten by `update-scaffold.sh`.

<!-- BEGIN PURPOSE -->
## Purpose
<!-- One sentence. Future state, present tense. -->
言語の壁を越えて、人は対話に飛び込んでいる。
<!-- END PURPOSE -->

<!-- BEGIN ANCHOR-DOMAINS -->
## Domains
<!-- Optional. Resources owned by the organization as a whole. -->
- The voice → transcript → summary → Q&A pipeline contract end-to-end.
- Cross-platform parity (iOS, Android, Web) of the capture and playback
  experience.
- The HMAC challenge-response trust boundary between client and server.
<!-- END ANCHOR-DOMAINS -->

<!-- BEGIN ANCHOR-ACCOUNTABILITIES -->
## Accountabilities
<!-- Optional. Obligations held at the whole-organization level. -->
- Maintaining compatibility with the pinned Expo SDK and React Native
  versions across the codebase.
- Treating `eas.json` as the single source of truth for build-time
  environment variables.
- Preserving the `packages/platform/` abstraction as the only path
  through which native APIs are reached from app code.
<!-- END ANCHOR-ACCOUNTABILITIES -->
