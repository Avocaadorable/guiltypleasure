# guiltypleasure.com

A small place for wishes, close people, and dates worth remembering.

The public GitHub Pages site is an **interactive demo**. People, gift ideas, and dates are fictional. Edits are stored only in the visitor's browser. There are no real accounts, email delivery, invitations, or shared cross-device data on the public demo. Sample product links point to example.com.

## Public demo

Publish the `docs/` folder from `main` with GitHub Pages. It runs without a backend or a build step. Asset paths are relative so it works at a project URL.

- Drag the center divider to resize the two independently scrolling panels.
- Add wishes and manage noted dates; reminders rotate automatically.
- Browse fictional people's wishlists and try claiming gifts.
- Width preferences and demo changes remain in the current browser.

## Run the original local application

Requires Python 3.9 or newer:

```sh
python3 preview.py
```

Open http://127.0.0.1:4175 and choose Enter preview. To add fictional demo data:

```sh
python3 seed_demo.py
```

The original application lives in `dist/` and `server.py`; `docs/` is the separate static demo. The local application stores its database in `private/`, which is excluded from version control. Real email authentication requires configuring the `GP_SMTP_HOST`, `GP_SMTP_PORT`, `GP_SMTP_USER`, `GP_SMTP_PASSWORD`, and `GP_SMTP_FROM` environment variables, then running `python3 server.py`. This is a local development server, not a production hosting setup.

## Typography

California is used for the wordmark and avatar initials; Edigna for interface text. Punctuation uses system fallback fonts. The supplied font files remain subject to their respective owners' licenses; no font license is granted by this repository.
