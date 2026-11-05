# MeiGen MCP 3.4.0

With the MeiGen provider, call `list_models` to find the current GIF or SVG image model and its price. Use `generate_image` for animated GIFs and editable SVG originals.

For example, “生成一张猫眨眼的循环动图” uses the listed GIF model, `outputFormat: "gif"`, and optionally `gifOptions: { frameSize: "384x384", frameCount: 8, frameDurationMs: 250 }`. This makes a two-second loop. Choose a size and frame count from the model’s live limits. For “生成一个可缩放的矢量徽标”, select the SVG model and `outputFormat: "svg"`. For transparent still images, choose PNG or WebP and `imageBackground: "transparent"`.

For a new GIF or SVG, include optional image guides in `referenceImages`. The model's `max_reference_images` in `list_models` sets the limit, up to two. The local npm server accepts direct image URLs or local file paths. To use a saved MeiGen character, connect to the remote MCP with OAuth, select it with `list_characters`, and call `generate_image` on that connection. Each distinct character uses one guide slot. A model with two slots can take one character and one ordinary image. To continue editing an existing GIF or SVG, open it in the MeiGen editor.

Completed GIFs keep their animation. For SVG, `imageUrl` is the PNG preview and `vectorOutput.url` is the original. Local downloads save the requested artifact. Existing requests can still be recovered by request ID.
