# Coin toss media handoff

Production media is intentionally absent. Database duration defaults to zero, so
the live toss stays immediate and these URLs are not requested until activation.

Supply two **512 × 512 px** GIFs with identical canvas and duration:

- `green-wins.gif`: spinning coin, ends on Green.
- `purple-wins.gif`: spinning coin, ends on Purple.

The page displays them at 192 px on small screens and 256 px on larger screens,
centered in the match page. Keep the coin inside the canvas with some padding.
Use a transparent background or match the site's dark background. Recommend
around 4 seconds, including a short final-frame hold; export **one playback, no
loop**, and aim for under 2 MB each. Supply the exact duration with the files.

Activation (only after both final files are supplied):

1. Verify both GIFs, equal dimensions/duration, first frame neutral, winner and
   final-frame hold correct, single playback. Put the files in this directory.
2. Deploy assets and code to VG Veto and verify both URLs work before enabling.
3. Set `public.coin_toss_presentation_settings.duration_ms` to their exact duration
   in milliseconds using a server credential. Supported range: 500–10000 ms;
   set to `0` to disable future animations immediately. No team can edit this.
4. Test both outcomes, team/observer/staff views, seeded bypass, failed media,
   refresh, reduced motion, and reset. Do not enable against the old EMEA project.

Backend result is authoritative. The reveal window is GIF duration plus a
2-second loading allowance; the winner's full 60 seconds starts at its end.
Late arrivals with insufficient playback time see a neutral waiting panel and
then the same result. Missing/slow media and reduced-motion users cannot block
the match. The winner is hidden in the on-page log until reveal; this is a
presentation feature, not a cryptographic secret from browser developer tools.
