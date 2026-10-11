# Kanban ↔ chat connector: what was built

Written 2026-10-11, after the work was finished and exercised by hand. It describes the shipped
behaviour, the defects that live testing found, and the two decisions that are still open.

The work spans two repositories, so it reaches upstream in two different ways:

| half | repository | route upstream |
|---|---|---|
| hub notifications, card attributes, board UI | `cline/kanban` | Feature Request discussion — `CONTRIBUTING.md` says feature PRs are not accepted |
| connector delivery, `/task`, buttons, replies | `cline/cline` | pull request |

## The problem

A board that runs agents in parallel is, by construction, something you are not watching. Before
this, a card that finished or needed a decision could only say so in a browser tab, on the
machine running the board. The hub already broadcast `ui.notify` to its subscribers and the CLI
connectors were already hub clients — the two halves had never been connected.

## What it does now

A card's whole life reaches the conversation it belongs to, and the conversation can answer back.

1. A card starts and reports what it is doing, as one message that updates in place.
2. When it needs a person, it asks — with the question and its options as buttons.
3. Tapping a button, or replying with the option's name, reaches that card's agent.
4. When it finishes, it says what it concluded.

Demands travel the other way too: `/task <what needs doing>` files a card into the repository
the conversation is bound to, with `--start`, `--brainstorm`, `--tags`, `--category` and
`--priority`.

## Decisions worth keeping

**A notification carries where it came from.** Without `source.workspacePath`, a subscriber
knows something is ready but not where, and can only broadcast or guess. Routing is strict:
deliver where a binding matches, and nowhere when none does. Silence is the honest answer to "I
do not know where this goes", and it is recoverable — a message in the wrong chat is not.

**Progress supersedes itself; a question does not.** The connector already had this convention
for ordinary chat: edit one status message, post a new one when input is needed. Extending that
convention to the hub was better than inventing a second one.

**The board owns what a card is.** The connector passes tags and priority through as typed and
lets Kanban judge them. Validating on both sides is how two halves drift apart.

**The number is the answer.** A terminal prompt is an interactive selection. Prose is accepted
and silently ignored, so the connector translates an option's name into its number — it
displayed those options itself, so it is not guessing — and refuses what it cannot place rather
than reporting success for an answer that will be dropped.

## Defects that only live testing found

All seven are of the same kind: the program meeting a person, not a logic error. No test suite
would have produced any of them, and each is now pinned by one.

1. **A method that did not exist.** The subscription declared `subscribe`; `HubUIClient` has
   `subscribeUI`. A cast hid it, every unit test passed against a fake with the invented shape,
   and the running connector died with `client.subscribe is not a function`.
2. **Subscriptions lost on restart.** They live in the chat library's in-memory state, so each
   restart silently stopped ordinary group messages from arriving — including replies — until a
   slash command happened to resubscribe the thread. Eleven commands were dropped before anyone
   noticed.
3. **The question never travelled.** The notice said "Using AskUserQuestion" and nothing else,
   so the person had to open the board to read the question — the board being the place the
   notification exists to spare them.
4. **Prose into a selection.** The answer was delivered and ignored while the connector
   reported "Passed to card". True, and useless.
5. **The same memory mistake, again.** Which message belonged to which card was kept in a map;
   a restart between question and answer made the reply unrecognisable. The same lesson as (2),
   two hours later, in our own code.
6. **Attributes destroyed by the UI.** `normalizeCard` rebuilds every card field by field, so
   tags and priority set from the CLI vanished on the first load-and-save in the browser. This
   is why "data only, UI later" was not a smaller scope — it was silent corruption.
7. **A duplicated question.** A post-tool hook produced a second notice whose text still carried
   the options, so buttons were offered for a question already answered.

## Two open decisions

**Filtering the board.** Nothing filters cards today and there is no toolbar to put a control
in. The risk is not the control: dragging inside a filtered column reorders a list the person
cannot see in full, and that order *is* the board's priority. Decide early whether dragging is
disabled under a filter or whether reordering is computed against the full list.

**Instruction versus guarantee.** Agents are told to go through the CLI and never to edit
`board.json`, because the service refuses a stale write with `409 CONFLICT` and a file write
bypasses that check. This is convention, not enforcement. An MCP server exposing the operations
as tools would leave nothing to ignore.
