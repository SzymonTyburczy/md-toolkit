# Chrome Web Store listing

Everything needed to publish MD Toolkit on the Chrome Web Store, ready to paste into the developer dashboard.

## Publishing checklist

1. Register as a developer at <https://chrome.google.com/webstore/devconsole>. Google charges a one-time fee of 5 USD per account. In the EU you also declare whether you are a trader; a free hobby project is usually a non-trader.
2. Get the package: download `md-toolkit-x.y.z.zip` from [Releases](https://github.com/SzymonTyburczy/md-toolkit/releases), or run `npm run package`.
3. In the dashboard choose **New item** and upload the zip.
4. **Store listing:** paste the texts below, pick the category, and upload the images from [`store/assets`](assets):
   - Screenshots: `1-themes-math-diagrams.png` to `5-edit-in-place.png` (1280x800)
   - Small promo tile: `promo-small-440x280.png`
   - The 128 px icon comes from the package itself.
5. **Privacy practices:** fill in the answers under [Privacy practices](#privacy-practices).
6. **Distribution:** Public, free, all regions.
7. Submit for review. Access to local files and the optional access to all websites can trigger an in-depth review, which takes longer than usual.
8. Once approved, add the store link to the README.

To refresh the images after interface changes, run `npm run build` and then `npm run store-assets`.

## Listing

- **Category:** Tools
- **Language:** English, with a Polish translation added as a second language
- **Homepage URL:** <https://github.com/SzymonTyburczy/md-toolkit>
- **Support URL:** <https://github.com/SzymonTyburczy/md-toolkit/issues>

### English

**Summary** (132 characters at most)

> Read and edit Markdown in Chrome: themes, math, diagrams, whole folders, editing in place and full control over typography.

**Description**

MD Toolkit turns any Markdown file into a clean, readable document, and lets you decide how it looks.

OPEN ANYTHING
- Local .md files, rendered as soon as you open them
- Whole folders, with a file tree, links between notes and search across every file
- Raw files from GitHub, Gist and GitLab, and any other website once you allow it
- Paste text into a new document

EDIT YOUR WAY
- Live mode: click any paragraph, list, table or diagram and edit its Markdown right inside the rendered page
- Split mode: a full editor beside the preview, with synced scrolling
- Saves straight to the file, and task boxes tick with one click

MAKE IT YOURS
- 8 themes: Light, Dark, Nord, Dracula, Tokyo Night, Gruvbox, One Dark and Academic, or follow your system
- Fonts, size, line height, paragraph and letter spacing
- Column width, margins, justification, hyphenation and accent colour
- Heading numbers, code fonts, line numbers and table styles

EVERYTHING RENDERS
- Syntax highlighting for dozens of languages
- Math with KaTeX and diagrams with Mermaid, in your theme's colours
- Tables, task lists, footnotes, callouts, emoji and front matter

READ COMFORTABLY
- Table of contents that follows your position
- Search, reading progress, word count and reading time
- Focus mode that dims everything but the current paragraph
- Export to a self-contained HTML file, print to PDF, or copy as formatted text

PRIVATE BY DESIGN
No servers, no analytics, no accounts. Your documents never leave your computer. Open source under the MIT licence.

To open local files, turn on "Allow access to file URLs" in the extension details after installing.

### Polski

**Podsumowanie** (najwyżej 132 znaki)

> Czytaj i edytuj Markdown w Chrome: motywy, wzory, diagramy, całe foldery, edycja w tekście i pełna kontrola nad typografią.

**Opis**

MD Toolkit zamienia każdy plik Markdown w czytelny dokument i pozwala zdecydować, jak ma wyglądać.

OTWIERAJ WSZYSTKO
- Lokalne pliki .md, renderowane od razu po otwarciu
- Całe foldery z drzewem plików, linkami między notatkami i wyszukiwaniem we wszystkich plikach
- Surowe pliki z GitHuba, Gista i GitLaba oraz dowolne inne strony, gdy na to zezwolisz
- Wklejanie tekstu do nowego dokumentu

EDYTUJ PO SWOJEMU
- Tryb Na żywo: kliknij akapit, listę, tabelę albo diagram i zmieniaj jego Markdown wprost w wyrenderowanej stronie
- Tryb Podział: pełny edytor obok podglądu z synchronizacją przewijania
- Zapis prosto do pliku, a zadania odhaczasz jednym kliknięciem

DOPASUJ DO SIEBIE
- 8 motywów: Jasny, Ciemny, Nord, Dracula, Tokyo Night, Gruvbox, One Dark i Akademicki albo zgodnie z systemem
- Kroje pisma, rozmiar, interlinia, odstępy między akapitami i literami
- Szerokość kolumny, marginesy, justowanie, dzielenie wyrazów i kolor akcentu
- Numeracja nagłówków, kroje kodu, numery linii i style tabel

RENDERUJE WSZYSTKO
- Kolorowanie składni dziesiątek języków
- Wzory w KaTeX i diagramy Mermaid w kolorach Twojego motywu
- Tabele, listy zadań, przypisy, callouty, emoji i front matter

WYGODNE CZYTANIE
- Spis treści śledzący pozycję czytania
- Wyszukiwarka, postęp czytania, liczba słów i czas czytania
- Tryb skupienia przyciemniający wszystko poza bieżącym akapitem
- Eksport do samodzielnego pliku HTML, druk do PDF i kopiowanie tekstu sformatowanego

PRYWATNOŚĆ OD PODSTAW
Żadnych serwerów, analityki ani kont. Twoje dokumenty nigdy nie opuszczają komputera. Otwarte źródło na licencji MIT.

Aby otwierać pliki lokalne, po instalacji włącz „Zezwalaj na dostęp do adresów URL plików” w szczegółach rozszerzenia.

## Privacy practices

**Single purpose**

> MD Toolkit displays and edits Markdown documents: local files, folders of Markdown files, raw Markdown files on the web, and pasted text.

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's appearance settings and the draft of an unsaved new document. |
| `scripting` | Registers the redirect from Markdown files to the viewer on all websites, only after the user grants that optional access on the options page. |
| Host permission `file:///*` | Reads the local Markdown files the user opens, and lists the folder around them for the file tree. Chrome keeps this off until the user allows file access. |
| Host permissions for `raw.githubusercontent.com`, `gist.githubusercontent.com`, `gitlab.com` | Renders raw Markdown files from these code hosting sites when the user opens one. |
| Optional host permissions `https://*/*`, `http://*/*` | Requested only when the user turns on "All other websites", to render Markdown files served by any site. |

**Remote code:** No, I am not using remote code. All scripts, fonts and libraries ship inside the package.

**Data usage:** The extension does not collect or transmit any of the listed data types. Tick none of them, and certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** <https://github.com/SzymonTyburczy/md-toolkit/blob/main/PRIVACY.md>
