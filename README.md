# Notable Notes Organizer

A web-based tool that helps you organize your [Notable](https://notable.app/) markdown files by their tags into a structured folder hierarchy.

## Features

- **Drag & Drop Interface**: Simply drag your Notable markdown files into the browser
- **Tag-based Organization**: Automatically organizes files into folders based on their YAML frontmatter tags
- **Multi-tag Support**: Files with multiple tags get placed in the primary tag folder with reference links in other tag folders
- **Cross-references**: Creates both Windows shortcuts (.url files) and markdown link files for multi-tagged notes
- **Progress Tracking**: Real-time progress display during file processing
- **ZIP Download**: Downloads your organized files as a convenient ZIP archive
- **Error Handling**: Graceful handling of files without tags or invalid formats

## How It Works

1. **Upload Files**: Drag and drop your Notable markdown files (`.md` files) or use the file picker
2. **Processing**: The app reads the YAML frontmatter from each file to extract tags
3. **Organization**: Files are organized into folders based on their tags:
   - Primary tag determines the main folder location
   - Additional tags get reference files (shortcuts and markdown links)
   - Files without tags go into an "untagged" folder
4. **Download**: Get your organized files as a ZIP archive

## File Structure

The organized output creates a structure like this:

```
organized-notes/
├── work/
│   ├── project-notes.md (original file)
│   └── meeting-notes.md
├── personal/
│   ├── ideas.md
│   ├── project-notes.url (shortcut to work/project-notes.md)
│   └── project-notes - Link.md (markdown reference)
└── untagged/
    └── random-note.md
```

## Usage

1. Open `index.html` in a web browser
2. Drag your Notable markdown files into the drop zone
3. Wait for processing to complete
4. Download the organized ZIP file
5. Extract to your desired location

## Supported File Formats

- **Markdown files** (`.md`) with YAML frontmatter
- Files must follow Notable's format with tags in frontmatter:

```yaml
---
title: "My Note"
tags: [work, project, important]
---

# Note Content
Your markdown content here...
```

## Technical Details

- **Frontend Only**: No server required - runs entirely in the browser
- **Dependencies**: 
  - Tailwind CSS for styling
  - JSZip for creating ZIP archives
  - js-yaml for parsing YAML frontmatter
- **Browser Compatibility**: Modern browsers with File API support

## Getting Started

1. Clone this repository:
   ```bash
   git clone https://github.com/peter-sharp/notable-to-folders.git
   ```

2. Open `index.html` in your web browser

3. Start organizing your Notable files!

## License

This project is open source and available under the MIT License.
