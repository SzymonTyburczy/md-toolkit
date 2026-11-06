# Chrome Web Store listing

Ready-to-paste text for the developer dashboard. Upload the zip from `npm run package`, or from a GitHub release.

- **Category:** Tools
- **Privacy policy URL:** <https://github.com/SzymonTyburczy/md-toolkit/blob/main/PRIVACY.md>
- **Screenshots:** `docs/screenshots/`. The store expects 1280x800, so resize them first.

## English

**Summary** (132 characters at most)

> Read and edit Markdown in Chrome with themes, math, diagrams, a table of contents and full control over typography.

**Description**

MD Toolkit turns any Markdown file into a clean, readable document, and lets you shape how it looks.

OPEN ANYTHING
- Local .md files, rendered automatically
- Raw files from GitHub, Gist and GitLab
- Any other website, once you allow it
- Paste text into a new document

MAKE IT YOURS
- 8 themes: Light, Dark, Nord, Dracula, Tokyo Night, Gruvbox, One Dark and Academic, or follow your system
- Choose fonts, size, line height, paragraph and letter spacing
- Set column width, margins, justification, hyphenation and accent colour
- Number headings, change their scale, restyle tables and code

EVERYTHING RENDERS
- Syntax highlighting for dozens of languages
- Math with KaTeX
- Diagrams with Mermaid, in your theme's colours
- Tables, task lists, footnotes, callouts, emoji and front matter

WORK WITH YOUR DOCUMENT
- Table of contents that follows your position
- Live split editor with synced scrolling and saving to disk
- Auto-reload when the file changes, keeping your place
- Search, reading progress, word count and reading time
- Focus mode that dims everything but the current paragraph
- Export to a self-contained HTML file, print to PDF, or copy as formatted text

PRIVATE BY DESIGN
No servers, no analytics, no accounts. Your documents never leave your computer. Open source under the MIT licence.

After installing, turn on "Allow access to file URLs" in the extension details to open local files.

## Polski

**Podsumowanie** (najwyżej 132 znaki)

> Czytaj i edytuj Markdown w Chrome: motywy, wzory, diagramy, spis treści i pełna kontrola nad typografią.

**Opis**

MD Toolkit zamienia każdy plik Markdown w czytelny dokument i pozwala zdecydować, jak ma wyglądać.

OTWIERAJ WSZYSTKO
- Lokalne pliki .md, renderowane automatycznie
- Surowe pliki z GitHuba, Gista i GitLaba
- Dowolne inne strony, gdy na to zezwolisz
- Wklejanie tekstu do nowego dokumentu

DOPASUJ DO SIEBIE
- 8 motywów: Jasny, Ciemny, Nord, Dracula, Tokyo Night, Gruvbox, One Dark i Akademicki albo zgodnie z systemem
- Wybór krojów pisma, rozmiaru, interlinii, odstępów między akapitami i literami
- Szerokość kolumny, marginesy, justowanie, dzielenie wyrazów i kolor akcentu
- Numeracja i skala nagłówków, style tabel i kodu

RENDERUJE WSZYSTKO
- Kolorowanie składni dziesiątek języków
- Wzory matematyczne w KaTeX
- Diagramy Mermaid w kolorach Twojego motywu
- Tabele, listy zadań, przypisy, callouty, emoji i front matter

PRACA Z DOKUMENTEM
- Spis treści śledzący pozycję czytania
- Edytor na żywo z synchronizacją przewijania i zapisem na dysk
- Automatyczne odświeżanie po zmianie pliku bez utraty miejsca
- Wyszukiwarka, postęp czytania, liczba słów i czas czytania
- Tryb skupienia przyciemniający wszystko poza bieżącym akapitem
- Eksport do samodzielnego pliku HTML, druk do PDF i kopiowanie tekstu sformatowanego

PRYWATNOŚĆ OD PODSTAW
Żadnych serwerów, analityki ani kont. Twoje dokumenty nigdy nie opuszczają komputera. Otwarte źródło na licencji MIT.

Po instalacji włącz „Zezwalaj na dostęp do adresów URL plików” w szczegółach rozszerzenia, aby otwierać pliki lokalne.

## Permission justifications

- **Host permissions:** reading local Markdown files and raw files from GitHub, Gist and GitLab so they can be rendered. All other sites are optional and requested only after the user turns them on.
- **storage:** saving appearance settings and the unsaved draft.
- **scripting:** registering the redirect for all websites after the user grants that optional permission.
- **Remote code:** none. All code, fonts and libraries ship inside the package.
