# A picture sent with /task reaches the card

Written 2026-10-12. This follows `2026-10-11-kanban-chat-loop.md` (where `/task` was introduced)
and `2026-10-12-card-closing-actions-design.md`.

| half | repository |
|---|---|
| `task create --image`, `task start` carrying the card's images, the board showing them | `cline/kanban` |
| reading the photo off the message, passing it to `/task` | `cline/cline` |

## The problem

A person sent a screenshot to Telegram with the caption `/task desativar a mensagem de ativação
do agente`. The screenshot showed the two "home_agent … Running" messages they wanted gone. The
card was created from the caption alone. The picture, which was the clearest description of
the demand, was dropped, and the card's agent never saw what "a mensagem de ativação" looked
like.

It is lost in three places, one after another:

1. **The connector never reads attachments.** The Telegram adapter puts the photo on
   `message.attachments` (`type: "image"`, `fetchData()` downloads it through `getFile`) and
   the caption on `message.text`. The connector passes only `message.text` to
   `handleConnectorUserTurn` (`telegram.ts:1563`), so neither a command nor an ordinary turn
   sees the picture. In an ordinary turn, `userImages` comes only from `@file` mentions in the
   text (`runtime/prompt.ts:104`).
2. **`kanban task create` takes no image.** Cards already hold images
   (`RuntimeBoardCard.images`: `{ id, data (base64), mimeType, name? }`), and the board can
   attach them. The CLI has no way to do so.
3. **`kanban task start` drops the card's images.** The board passes `images: task.images`
   when it starts a session (`web-ui/src/hooks/use-task-sessions.ts:161`). The CLI does not
   (`src/commands/task.ts:986`). So a card that does have images, started with `/task --start`,
   reaches its agent without them. This is a defect on its own, independent of the rest.

The last step already works. When a session starts with images, the runtime writes them to a
temporary directory and names the files in the agent's prompt (`prepareTaskPromptWithImages`,
`src/terminal/task-image-prompt.ts`). Terminal agents read them from there; native Cline gets
them as images.

## What it does

A photo whose caption is a `/task` command becomes an image on the card. The card's agent
receives it when the card starts, whether it starts with `--start`, by a later
`kanban task start`, or from the board.

`/task --brainstorm` also hands the picture to the conversation's agent that refines the
demand, so the card it files carries the image too.

## Kanban

**`task create --image <path>`** (repeatable):

- Reads each file and stores it on the card as
  `{ id, data: base64, mimeType, name: basename }`. The `id` is generated the way the board
  generates image ids (reuse that helper; find it with
  `rg -n "images" web-ui/src/components/task-create*`).
- The `mimeType` comes from the extension: `.png`, `.jpg`/`.jpeg`, `.gif` and `.webp` are
  accepted. Anything else is refused with a clear error, and the card is not created: an image
  the agent cannot open is worse than none, because the card then claims to have it.
- Each image is capped at 5 MB, and the command refuses anything larger. Images are stored
  base64 inside the board's state file, and a 20 MB photo there makes every board read pay for
  it.

**`task start`** passes `images: task.images` to `runtime.startTaskSession`, exactly as the board
does.

## Board: showing the picture

Today a card's images appear only in the composer that creates it (`task-image-strip.tsx`). The
board card (`board-card.tsx`) and the detail view never show them, so a card filed with a
screenshot would look the same as one without.

**The card in the column** (only when `card.images` is non-empty; a card without images is
unchanged):

- The first image is the card's background: `background-size: cover`, centred. It is the one
  dynamic value, so it goes in an inline `style`; everything else uses Tailwind classes.
- The card's content (top row, title, prompt preview, status) sits on a panel of the card's own
  surface at 80% opacity: `bg-surface-2/80`, and `bg-surface-3/80` on hover and selection,
  mirroring today's `bg-surface-2` / `hover:bg-surface-3`. The text stays as readable as on a
  plain card, and the picture shows through the gaps and around the edges.
- The card grows a little, not to the screenshot's size: `min-h-28` (112px) against today's
  content height. That is enough to tell there is a picture and roughly what it is; reading it
  is what the detail view is for. The column's density barely changes.
- With more than one image, the top row shows a small `Image` icon (lucide, 12px) and the count
  (`2`), in the style of the existing tag overflow (`+N`). Only the first image is the
  background.
- The background is decorative to a screen reader. The count carries an `aria-label`
  ("2 imagens").
- **Performance:** an image is base64 of up to 5 MB, and repeating it as a `data:` URL in a
  `style` on every render of every card would be heavy. A small hook,
  `useTaskImageObjectUrl(image)`, decodes it once into a `Blob` and an object URL, keyed by
  `image.id`, and revokes the URL on unmount or when the image changes. Following AGENTS.md,
  check `@/kanban/utils/react-use` for an existing hook first, and write this one only if none
  fits.

**The detail view** (`card-detail-view.tsx`): the card's images are shown with the existing
`TaskImageStrip`, read-only (no `onRemoveImage`), above the prompt. The strip gains an optional
`onOpenImage`: in the detail view, clicking a thumbnail opens the image at full size in a new
tab, through `useTaskImageObjectUrl`. The strip has no click behaviour today; the composer that
creates a card leaves `onOpenImage` unset and behaves as now.

## Cline connector

**Reading the picture.** The connector hands the incoming message's image attachments to the
turn. This happens in the turn's entry (`handleTurn` / `handleConnectorUserTurn`), not inside
`/task`, so the command does not reach back into the adapter.

- `ChatCommandContext` gains
  `images?: () => Promise<Array<{ data: Buffer; mimeType: string; name?: string }>>`. It is
  lazy: the download happens only for a command that wants the image, never for every message
  that happens to carry one.
- It returns only attachments with `type === "image"`, or with an `image/*` mimeType when the
  photo was sent "as a file". Each one is downloaded with `fetchData()`.
- A download that fails is skipped, and the command then says so (below). It never fails
  `/task`: the demand in the caption still deserves its card.

**`/task` with a picture:**

- Writes each image into a fresh directory under the connector's data dir
  (`<clineDataDir>/connectors/<transport>/task-images/<uuid>/`), with the extension taken from
  its mimeType. It does not go under `/tmp`, so it survives a reboot between filing a card and
  a brainstorming agent using the path.
- Passes one `--image <path>` per file to `kanban task create`
  (`KanbanTaskRequest.images?: string[]`, then `buildKanbanCreateArgs`).
- Removes the directory once `task create` has returned, because the card now holds the bytes.
  For `--brainstorm` it is kept, since the agent has not run yet. That directory is cleared on
  the next connector start for anything older than 7 days.
- `--brainstorm` adds the paths to the brainstorm prompt, as a line the agent is told to pass
  on: "Attach these images to the card with `--image`: <paths>". The agent files the card
  itself, so this is the only way the picture can get there.
- The reply says the picture was attached: "Added to the kanban backlog: … (card b4e17, 1
  imagem)". When a download failed, it says that instead: "… a imagem não pôde ser baixada".
  Either way the person can tell from the conversation whether the card saw the picture.

## Out of scope

- **Pictures in ordinary conversation turns.** The same lazy `images()` reader makes this a
  short follow-up: pass the images to `ChatRunTurnRequest.attachments.userImages`. It changes
  what every chat turn sends to the model, though, so it gets its own decision.
- **The picture in the message a `/task` replies to.** The adapter parses `replyTo` with its
  attachments, so "reply to a screenshot with /task …" is possible later with the same reader.
- **Albums.** Telegram sends each photo of an album as its own message, and only the one with
  the caption carries `/task`. Only that photo is attached.
- **Slack and Discord.** The reader lives on the shared context, but only the Telegram entry
  fills it in this change.
- **`task update --image`.** Giving an existing card a picture would be the same code, but
  `/task` does not need it.

## Testing

**Kanban:**
- `--image` with a `.png` stores base64, the mimeType and the name on the card.
- An unsupported extension is refused, and no card is created.
- A file over 5 MB is refused.
- `task start` sends the card's images to `startTaskSession`. This is tested on the call's
  input, the same way `task-closing-commands` is tested.

**Board (web-ui):**
- A card with an image renders it as background, behind an 80% content panel, with `min-h-28`.
- A card with no image renders exactly as today, with no background style and no extra height.
- Two images: the count shows, and the first image is the background.
- `useTaskImageObjectUrl` creates one object URL per image and revokes it on unmount and when
  the image changes.
- The detail view shows the strip read-only.

**Cline:**
- `buildKanbanCreateArgs` gives one `--image` per path.
- `/task` with an image context writes the files, passes them, removes them after creating the
  card, and keeps them for `--brainstorm`.
- A download that fails still files the card and says so.
- The Telegram entry exposes only image attachments, downloaded lazily: not fetched when the
  command does not ask.

**Live:** a screenshot with the caption `/task …` in the Kanban topic. The card in the board
shows the image, and the agent, started with `--start`, describes what is in it.
