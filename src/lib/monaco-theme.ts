/**
 * Emma "Futuristic" Monaco theme.
 *
 * Color choices are deliberate, not just decorative — every token category maps
 * to a meaning so syntax communicates structure at a glance:
 *
 *   • keywords / control flow → electric magenta (the "verbs" of the program)
 *   • types / classes / interfaces → cyan (structural nouns)
 *   • functions / methods       → soft mint (actions)
 *   • variables / parameters    → warm cream (data)
 *   • constants / numbers       → amber (literals you should notice)
 *   • strings                   → pastel green (boundary data)
 *   • comments                  → muted lavender italic (meta)
 *   • regex / escapes / tags    → coral (dangerous-ish, eye-catching)
 *
 * Combined with deep selection/line-highlight shadows it gives the editor a
 * "bubbly, glowing" feel without sacrificing legibility.
 */
import type { Monaco } from "@monaco-editor/react";

export const EMMA_THEME_NAME = "emma-futuristic";

let defined = false;

export function defineEmmaMonacoTheme(monaco: Monaco) {
  if (defined) return;
  defined = true;

  monaco.editor.defineTheme(EMMA_THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      // base
      { token: "", foreground: "E6EAF5", background: "070A13" },

      // comments — meta info, recede
      { token: "comment", foreground: "6F6E9B", fontStyle: "italic" },
      { token: "comment.doc", foreground: "8A89BD", fontStyle: "italic" },

      // keywords — the "verbs"
      { token: "keyword", foreground: "FF5BD1", fontStyle: "bold" },
      { token: "keyword.control", foreground: "FF5BD1", fontStyle: "bold" },
      { token: "keyword.operator", foreground: "FF7AD9" },
      { token: "storage", foreground: "FF5BD1", fontStyle: "bold" },
      { token: "storage.type", foreground: "5CC8FF" },
      { token: "storage.modifier", foreground: "FF5BD1" },

      // types / interfaces / classes — structural nouns
      { token: "type", foreground: "5CC8FF" },
      { token: "type.identifier", foreground: "5CC8FF" },
      { token: "interface", foreground: "5CC8FF", fontStyle: "italic" },
      { token: "class", foreground: "7EE8FF", fontStyle: "bold" },
      { token: "class.identifier", foreground: "7EE8FF" },
      { token: "namespace", foreground: "9DD9FF" },
      { token: "enum", foreground: "5CC8FF" },

      // functions / methods — actions
      { token: "function", foreground: "8DF5C9" },
      { token: "function.declaration", foreground: "8DF5C9", fontStyle: "bold" },
      { token: "method", foreground: "8DF5C9" },
      { token: "support.function", foreground: "8DF5C9" },

      // variables / parameters — data
      { token: "variable", foreground: "F2E8C9" },
      { token: "variable.parameter", foreground: "F8D589", fontStyle: "italic" },
      { token: "variable.predefined", foreground: "FFB36E" },
      { token: "identifier", foreground: "E6EAF5" },

      // strings
      { token: "string", foreground: "9BE7A2" },
      { token: "string.escape", foreground: "FF8A6E", fontStyle: "bold" },
      { token: "string.quoted", foreground: "9BE7A2" },
      { token: "string.template", foreground: "B9F0BF" },

      // numbers / constants — literals you should notice
      { token: "number", foreground: "FFB86B", fontStyle: "bold" },
      { token: "constant", foreground: "FFB86B" },
      { token: "constant.language", foreground: "FF7AD9", fontStyle: "bold" }, // true/false/null
      { token: "constant.numeric", foreground: "FFB86B" },

      // regex — dangerous, stand out
      { token: "regexp", foreground: "FF8A6E" },

      // operators / punctuation — quiet
      { token: "operator", foreground: "B5B9D9" },
      { token: "delimiter", foreground: "8B90B8" },
      { token: "delimiter.bracket", foreground: "C7CCEC" },
      { token: "delimiter.parenthesis", foreground: "C7CCEC" },
      { token: "delimiter.square", foreground: "C7CCEC" },
      { token: "delimiter.curly", foreground: "C7CCEC" },

      // markup / tags — coral, attention-grabbing
      { token: "tag", foreground: "FF8AB0" },
      { token: "tag.id", foreground: "FFB86B" },
      { token: "tag.class", foreground: "8DF5C9" },
      { token: "metatag", foreground: "FF5BD1" },
      { token: "attribute.name", foreground: "F8D589" },
      { token: "attribute.value", foreground: "9BE7A2" },

      // JSON
      { token: "string.key.json", foreground: "7EE8FF" },
      { token: "string.value.json", foreground: "9BE7A2" },

      // CSS
      { token: "attribute.name.css", foreground: "F8D589" },
      { token: "attribute.value.css", foreground: "9BE7A2" },
      { token: "tag.css", foreground: "FF8AB0" },

      // markdown
      { token: "emphasis", fontStyle: "italic" },
      { token: "strong", fontStyle: "bold" },
      { token: "keyword.md", foreground: "FF5BD1" },
    ],
    colors: {
      // surfaces — match app deep-ink palette
      "editor.background": "#070A13",
      "editor.foreground": "#E6EAF5",
      "editorCursor.foreground": "#7EE8FF",
      "editorCursor.background": "#070A13",

      // gutter
      "editorLineNumber.foreground": "#3B4068",
      "editorLineNumber.activeForeground": "#7EE8FF",
      "editorGutter.background": "#070A13",

      // current line — soft glow, deep shadow
      "editor.lineHighlightBackground": "#10162A",
      "editor.lineHighlightBorder": "#1A2244",

      // selection — bubbly, saturated, shadow-like
      "editor.selectionBackground": "#5CC8FF55",
      "editor.selectionHighlightBackground": "#5CC8FF22",
      "editor.inactiveSelectionBackground": "#5CC8FF22",
      "editor.wordHighlightBackground": "#FF5BD12A",
      "editor.wordHighlightStrongBackground": "#FF5BD144",
      "editor.findMatchBackground": "#FFB86B66",
      "editor.findMatchHighlightBackground": "#FFB86B33",

      // brackets — pop with neon
      "editorBracketMatch.background": "#7EE8FF33",
      "editorBracketMatch.border": "#7EE8FF",
      "editorBracketHighlight.foreground1": "#FF5BD1",
      "editorBracketHighlight.foreground2": "#7EE8FF",
      "editorBracketHighlight.foreground3": "#8DF5C9",
      "editorBracketHighlight.foreground4": "#F8D589",
      "editorBracketHighlight.foreground5": "#FF8AB0",
      "editorBracketHighlight.foreground6": "#FFB86B",
      "editorBracketHighlight.unexpectedBracket.foreground": "#FF6B6B",

      // indent guides
      "editorIndentGuide.background": "#1A2244",
      "editorIndentGuide.activeBackground": "#5CC8FF66",

      // whitespace
      "editorWhitespace.foreground": "#1A2244",

      // overview ruler
      "editorOverviewRuler.border": "#0B0F1E",
      "editorOverviewRuler.errorForeground": "#FF6B6B",
      "editorOverviewRuler.warningForeground": "#FFB86B",
      "editorOverviewRuler.infoForeground": "#5CC8FF",

      // scrollbar — bubbly translucent
      "scrollbarSlider.background": "#1A224488",
      "scrollbarSlider.hoverBackground": "#5CC8FF44",
      "scrollbarSlider.activeBackground": "#5CC8FF77",
      "scrollbar.shadow": "#000000AA",

      // suggest widget — glassy
      "editorWidget.background": "#0B0F1EF5",
      "editorWidget.border": "#1A2244",
      "editorSuggestWidget.background": "#0B0F1EF5",
      "editorSuggestWidget.border": "#1A2244",
      "editorSuggestWidget.foreground": "#E6EAF5",
      "editorSuggestWidget.selectedBackground": "#5CC8FF22",
      "editorSuggestWidget.highlightForeground": "#7EE8FF",
      "editorHoverWidget.background": "#0B0F1EF5",
      "editorHoverWidget.border": "#1A2244",

      // diagnostics
      "editorError.foreground": "#FF6B6B",
      "editorWarning.foreground": "#FFB86B",
      "editorInfo.foreground": "#5CC8FF",

      // diff
      "diffEditor.insertedTextBackground": "#8DF5C922",
      "diffEditor.removedTextBackground": "#FF6B6B22",

      // links
      "editorLink.activeForeground": "#7EE8FF",
    },
  });
}
