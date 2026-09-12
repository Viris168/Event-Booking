/*
 * The layout both admin queues are built on: a ruled list on the left, a
 * detail rail on the right, and a decision bar pinned to the bottom of it.
 *
 * Shared because /admin/review and /admin/applications are the same screen
 * doing different work, and an admin who learns one should not have to learn
 * the other. One file also means a spacing or focus fix lands on both at once
 * rather than on whichever was edited last.
 *
 * Scoped here rather than in styles/index.css on purpose: that file is being
 * actively edited on another branch, and a split view is a screen's layout,
 * not a shared primitive. Every class is rq- prefixed. Colours come from the
 * existing custom properties so light and dark both follow the app's theme.
 */
export const RQ_CSS = `
/*
 * A reading screen, not a dashboard.
 *
 * The reviewer's job here is to read a submission and judge it, so the design
 * follows a document: one column of candidates ruled off by hairlines, and the
 * submission itself set as prose with a real heading, at a size meant to be
 * read rather than scanned.
 *
 * Three things were deliberately removed from the earlier pass, all of them on
 * the list in CLAUDE.md or next to it:
 *
 *   - nested boxes. Page card holding a table card holding row cards holding a
 *     rail card. Four borders deep before any content. Rows are separated by a
 *     hairline now and the rail is a single panel.
 *   - uppercase micro-labels (EVENT, BASICS, SCHEDULE) in tiny letterspaced
 *     caps. They label things that are already obvious from their content, and
 *     they are the single clearest tell of a generated admin template.
 *   - a type scale where everything sat between .68 and .8rem. Nothing could be
 *     more important than anything else, which is the same as having no
 *     hierarchy at all.
 *
 * One 4px spacing scale. Every length below is one of these.
 */
.rq-wrap {
  --rq-1: .25rem; --rq-2: .5rem; --rq-3: .75rem; --rq-4: 1rem;
  --rq-5: 1.5rem; --rq-6: 2rem;
  max-width: var(--container-shell, 1360px); margin: 0 auto;
  padding: var(--spacing-page, 1.15rem); color: var(--color-ink);
}

.rq-head { display: flex; gap: var(--rq-4); align-items: baseline;
           justify-content: space-between; flex-wrap: wrap;
           padding-bottom: var(--rq-3); margin-bottom: var(--rq-5);
           border-bottom: 1px solid var(--color-line); }
.rq-head h1 { margin: 0; letter-spacing: -.022em; }
.rq-head p { margin: var(--rq-1) 0 0; color: var(--color-muted); }
.rq-head-right { display: flex; gap: var(--rq-4); align-items: baseline; }

/*
 * The dropdown the browser opens is NOT styled by the rules below - it is an
 * operating-system widget. What controls it is color-scheme: told 'dark', the
 * browser paints that list dark and picks a readable text colour itself.
 *
 * Without it the popup came up in its default white while the options inherited
 * --color-ink, which is near-white in dark mode. White on white, unreadable -
 * and invisible to any amount of styling aimed at .rq-filter select.
 *
 * The page-level <meta name="color-scheme" content="light dark"> follows the
 * OS, so it gets this wrong for anyone who forces the app's own theme against
 * their system setting. This states it from the same place the theme is set.
 */
.rq-filter select {
  appearance: none; font: inherit; font-size: .85rem; font-weight: 500;
  padding: var(--rq-1) 1.6rem var(--rq-1) var(--rq-2);
  border: 0; border-bottom: 1px solid var(--color-line);
  border-radius: 0; color: var(--color-ink); cursor: pointer;
  color-scheme: light;
  /* Opaque, like the app's own .select. A transparent control leaves the
     native popup to fall back to white. */
  background-color: var(--color-surface);
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
                    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 9px) 58%, calc(100% - 4px) 58%;
  background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
}
[data-theme='dark'] .rq-filter select { color-scheme: dark; }
/* Belt and braces: some engines do read these, and where they do not the
   color-scheme above has already made the popup readable. */
.rq-filter select option { background: var(--color-surface); color: var(--color-ink); }
.rq-filter select:hover { border-bottom-color: var(--color-ink); }
.rq-count { white-space: nowrap; font-size: .85rem; color: var(--color-muted);
            font-variant-numeric: tabular-nums; }

/* No wrapper card. The list sits on the page and the rail beside it - the
   only framed thing on the screen, because it is the only thing that scrolls
   independently. Rail is wide enough to read a paragraph in. */
.rq-split { display: grid; grid-template-columns: minmax(0, 1fr) 440px;
            gap: var(--rq-6); align-items: start; }
@media (max-width: 1180px) { .rq-split { grid-template-columns: minmax(0, 1fr) 380px; gap: var(--rq-5); } }
@media (max-width: 1024px) { .rq-split { grid-template-columns: 1fr; } }

.rq-col { display: flex; flex-direction: column; gap: var(--rq-4); min-width: 0; }
.rq-tablewrap { overflow-x: auto; }
.rq-queue { width: 100%; border-collapse: collapse; }
.rq-queue thead th { text-align: start; font-size: .78rem; font-weight: 500;
                     color: var(--color-muted); padding: 0 var(--rq-3) var(--rq-2);
                     white-space: nowrap; border-bottom: 1px solid var(--color-line); }
.rq-queue thead th:first-child { padding-inline-start: var(--rq-3); }
.rq-queue thead th.rq-num { text-align: end; padding-inline-end: var(--rq-3); }

/*
 * Ruled, not boxed, and one signal for "current": a solid edge on the leading
 * side plus a quiet fill. No ring, no border tracing the row.
 */
.rq-qrow { cursor: pointer; }
.rq-qrow > td { padding: var(--rq-3); vertical-align: baseline;
                border-bottom: 1px solid var(--color-line-2);
                box-shadow: inset 3px 0 0 0 transparent;
                transition: background .1s; }
/* Breathing room at both ends so the first title and the last number are not
   flush against the edge of the scroll container. */
.rq-qrow > td:last-child { padding-inline-end: var(--rq-3); }
.rq-qrow:hover > td { background: var(--color-surface-2); }
.rq-qrow.is-on > td { background: var(--color-surface-2); }
.rq-qrow.is-on > td:first-child { box-shadow: inset 3px 0 0 0 var(--color-ink); }
.rq-qrow.is-on .rq-qtitle { color: var(--color-ink); }

/*
 * Focus is deliberately quiet.
 *
 * A row carries tabindex so the queue is keyboard-workable, and a browser keeps
 * that focus after a click - so a 2px bright ring stayed painted around the row
 * you had just clicked, competing with the selection mark beside it and reading
 * as an error state. One hairline in the text colour says "keyboard is here"
 * without shouting it.
 */
.rq-qrow:focus-visible { outline: 1px solid var(--color-muted);
                         outline-offset: -1px; }

.rq-qtitle { font-size: .95rem; font-weight: 600; letter-spacing: -.012em;
             color: var(--color-ink-2); }
.rq-qsub { font-size: .78rem; color: var(--color-muted); margin-top: 2px;
           line-height: 1.45; }
.rq-qmuted { color: var(--color-muted); font-size: .85rem; }

/* --------------------------------------------------------------- the rail */
.rq-panel { border: 1px solid var(--color-line);
            border-radius: var(--radius-card, 16px);
            background: var(--color-surface); color: var(--color-ink);
            display: flex; flex-direction: column;
            /* Sized to fit BELOW the nav, sub-nav and page heading, which
               is where it sits before any scrolling. Sticky pins it to the top
               afterwards, where it could afford to be taller - but a decision
               bar that starts off the bottom of the screen is worse than one
               that never uses the last 40px. */
            max-height: calc(100vh - 248px); overflow: hidden;
            position: sticky; top: var(--rq-4); }
.rq-panel-scroll { overflow-y: auto; padding: var(--rq-5);
                   display: flex; flex-direction: column; gap: var(--rq-5); }

/* The submission's own heading, set like one. */
.rq-panel-head { display: flex; flex-direction: column; gap: var(--rq-2);
                 align-items: flex-start; }
.rq-panel-head h2 { margin: 0; font-size: 1.35rem; line-height: 1.2;
                    letter-spacing: -.025em; }
.rq-panel-head .km-title { font-size: .95rem; color: var(--color-ink-2); }

.rq-cover { width: 100%; max-height: 170px; object-fit: cover;
            border-radius: var(--radius-ui, 12px); }
.rq-cover-empty { display: flex; align-items: center; justify-content: center;
                  gap: var(--rq-2); height: 60px; max-height: none;
                  color: var(--color-muted); font-size: .8rem;
                  background: var(--color-surface-2);
                  border: 1px dashed var(--color-line); }
.rq-banner { width: 100%; border-radius: var(--radius-tiny, 8px); }

/* Sentence case, normal tracking, real weight. A heading, not a tag. */
.rq-section > h3 { margin: 0 0 var(--rq-2); font-size: .9rem; font-weight: 600;
                   letter-spacing: -.005em; color: var(--color-ink); }

.rq-kv { display: flex; justify-content: space-between; gap: var(--rq-4);
         padding: var(--rq-2) 0; font-size: .875rem; align-items: baseline;
         border-top: 1px solid var(--color-line-2); }
.rq-section > .rq-kv:first-of-type { border-top: 0; padding-top: 0; }
.rq-kv > span:first-child { color: var(--color-muted); white-space: nowrap; }
.rq-kv > span:last-child { text-align: end; font-variant-numeric: tabular-nums; }

/* Prose, at a size meant to be read. */
.rq-desc { margin: 0 0 var(--rq-3); white-space: pre-wrap; line-height: 1.7;
           font-size: .9rem; color: var(--color-ink-2); max-width: 62ch; }

.rq-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
.rq-table td { padding: var(--rq-2) 0; vertical-align: baseline;
               border-top: 1px solid var(--color-line-2); }
.rq-table tr:first-child td { border-top: 0; }
.rq-num { text-align: end; white-space: nowrap;
          font-variant-numeric: tabular-nums; color: var(--color-ink-2); }

/* The decision bar. Approve commits and reads that way; Changes is the
   reversible middle; Reject is quietest because it is the only one that
   cannot be walked back. */
.rq-actions { display: flex; flex-direction: column; gap: var(--rq-3);
              padding: var(--rq-4) var(--rq-5);
              border-top: 1px solid var(--color-line);
              background: var(--color-surface); }
.rq-total { display: flex; justify-content: space-between; align-items: baseline;
            font-size: .875rem; color: var(--color-muted); }
.rq-total b { font-size: 1.15rem; color: var(--color-ink);
              font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.rq-actpair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--rq-2); }

.rq-act { display: inline-flex; align-items: center; justify-content: center;
          gap: var(--rq-2); font: inherit; font-size: .875rem; font-weight: 600;
          padding: var(--rq-3) var(--rq-4); border-radius: var(--radius-ui, 12px);
          border: 1px solid transparent; cursor: pointer; width: 100%;
          transition: background .12s, border-color .12s; }
.rq-act:disabled { opacity: .5; cursor: not-allowed; }
.rq-act-approve { background: var(--color-ink); color: var(--color-surface); }
.rq-act-approve:not(:disabled):hover { background: var(--color-brand-800); }
.rq-act-changes { background: transparent; color: var(--color-ink-2);
                  border-color: var(--color-line); }
.rq-act-changes:not(:disabled):hover { border-color: var(--color-ink-2);
                                       background: var(--color-surface-2); }
.rq-act-reject { background: transparent; color: var(--color-danger);
                 border-color: transparent; }
.rq-act-reject:not(:disabled):hover { border-color: var(--color-danger); }
[data-theme='dark'] .rq-act-approve { background: var(--color-ink);
                                      color: var(--color-page); }
[data-theme='dark'] .rq-act-approve:not(:disabled):hover {
  background: var(--color-brand-100); }
`
