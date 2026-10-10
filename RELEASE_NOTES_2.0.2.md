# MeiGen 2.0.2 — historical release notes

> Historical notes for 2.0.2. Current development has removed ComfyUI and the bundled prompt library; use the current README for supported features.

- Search returns at most three matched-image previews, standard MCP image content and artifact links. Older negotiated protocol versions receive text links instead of unsupported resource_link content.
- Completed generation and skill results expose reusable artifacts; polling tools disclose settlement writes without being marked destructive. Search and upload disclose quota side effects.
- API Key, local file preparation, BYOK and ComfyUI modes remain supported. Browser OAuth is provided by the separately configured Web remote endpoint, not by this local npm package.
- Tests now load source before build; SDK lower bound is 1.30.1. A clean-checkout test/build and release dry run are required before publication.

- `get_inspiration` includes standard resource links for media previews.
- Search results include bounded JPEG image blocks where supported. A local-library search can fetch public CDN thumbnails; local search does not mean offline media delivery.
- The prepared npm package may be published before Web's public installation/version copy is updated. Run the guidance check against the intended Web checkout; then verify npm availability before updating all Web pins and softwareVersion together.

## Gallery text contract

`get_inspiration` now returns a label followed by one JSON line containing id, prompt, author, model and urls, plus categories/rank when available from the local entry. The former Markdown sections, likes/views/date, @handle, dimensions and thumbnail_url are removed. `search_gallery` quotes author, model/category and prompt summaries as JSON strings. Consumers parsing text must parse the JSON data rather than the old Markdown layout. Resource links are supplementary previews; original URLs remain in the text data.
