# AgentCity Art

These original raster assets were generated for AgentCity using OpenAI image generation:

- `navora.png`: illustrated town terrain, drawn around the 40-by-40 city grid.
- `citizens.png`: five portrait columns, ordered Ava, Mateo, Noah, Iris, Leo.
- `citizen-sprites.png`: five transparent full-body sprite columns in the same order.

The live town and citizens are now original Three.js geometry in `src/game/three`.
Only `citizens.png` is used by the current UI, cropped into portraits with CSS.
`navora.png` and `citizen-sprites.png` are retained concept artwork, not runtime backgrounds or characters.

Artwork follows the repository's noncommercial usage terms. No third-party tileset is bundled.
New citizen profiles receive a palette-based fallback 3D character and an initial portrait until
their art is added. The generated art is presentation, not simulation state or collision data.
