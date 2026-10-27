# Coin toss video assets

These MP4s contain the full original Green/Purple animations, converted from the
media team's GIFs without trimming, resizing, changing speed, or dropping frames.

| File | Dimensions | Frames / FPS | Duration | Bytes |
|---|---|---|---|---|
| green-wins.mp4 | 448 × 448 | 133 / 25 | 5.32 seconds | 631510 |
| purple-wins.mp4 | 448 × 448 | 133 / 25 | 5.32 seconds | 618805 |

Both use H.264, yuv420p, no audio, and MP4 faststart. Only the backend winner's
clip is requested. The player is muted, inline, has no controls, never loops,
and finishes through the native `ended` event. It retains the final frame until
the shared reveal deadline. The winner and Team A/B controls are hidden until
the reveal completes; the server reserves the full 60-second choice clock.
The page renders the square video at 192 px on small screens / 256 px on larger
screens. Reduced-motion, late-arrival, media-error and blocked-autoplay cases
use a neutral waiting panel and cannot indefinitely block the match.
A refresh does not replay the same toss in that tab; a new toss can play again.

## Release is intentionally pending

Do not push, deploy, or activate without the owner's instruction. Production
`coin_toss_presentation_settings.duration_ms` remains **0**. For release:

1. Deploy both MP4s and their player together, verify their public URLs.
2. Set the VG Veto setting to **5320** milliseconds with a server credential.
   Keep it 0 until the assets and player are deployed. No migration in this
   commit enables production animations.
3. Check both outcomes and the full 5.32-second playback before choices appear.
   Confirm the 60-second server clock, resets, seeded bypass and error fallback.
4. To disable future animations set the duration to 0. Do not change old EMEA.

Conversion used FFmpeg libx264, preset slow, CRF 23, yuv420p, 25 FPS, no audio,
metadata removed and `+faststart`. The original large GIFs are not shipped.
The reveal window includes a bounded 2-second loading allowance. Clips start
only when a full playback fits in that window. An already-playing clip is not
cut short by the reveal clock; a stalled decoder has a bounded error fallback.
This hides the result in the page UI, not from browser developer tools.
