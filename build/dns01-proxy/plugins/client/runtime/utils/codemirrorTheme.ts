import { EditorView } from '@codemirror/view'

export const acmednsCodeMirrorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--paper)',
    color: 'var(--ink)',
    fontSize: '0.875rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.5',
  },
  '.cm-content': {
    padding: '12px 12px 12px 4px',
    caretColor: 'var(--signal)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--signal)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--panel)',
    color: 'var(--muted)',
    border: 'none',
    borderRight: '1px solid var(--rule)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
    minWidth: '2.5em',
    textAlign: 'right',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--ink)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--signal) 6%, transparent)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--signal) 20%, transparent) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--signal) 28%, transparent) !important',
  },
})
