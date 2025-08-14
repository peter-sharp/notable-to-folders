class NotableOrganizer {
    constructor() {
        this.files = [];
        this.processedFiles = [];
        this.zip = null;
        this.currentFileIndex = 0;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const downloadBtn = document.getElementById('downloadBtn');
        const resetBtn = document.getElementById('resetBtn');

        // Drag and drop events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Download button
        downloadBtn.addEventListener('click', () => {
            this.downloadZip();
        });

        // Reset button
        resetBtn.addEventListener('click', () => {
            this.reset();
        });
    }

    async handleFiles(fileList) {
        const files = Array.from(fileList);
        
        // Separate ZIP files from markdown files
        const zipFiles = files.filter(file => 
            file.name.endsWith('.zip') || file.type === 'application/zip'
        );
        const markdownFiles = files.filter(file => 
            file.name.endsWith('.md') || file.type === 'text/markdown'
        );

        let allMarkdownFiles = [...markdownFiles];

        // Process ZIP files if any
        if (zipFiles.length > 0) {
            this.updateCurrentFile('Extracting ZIP files...');
            this.showProgressSection();
            
            try {
                for (const zipFile of zipFiles) {
                    const extractedFiles = await this.extractZipFile(zipFile);
                    allMarkdownFiles.push(...extractedFiles);
                }
            } catch (error) {
                this.showError(`Error processing ZIP file: ${error.message}`);
                return;
            }
        }

        if (allMarkdownFiles.length === 0) {
            this.showError('No markdown files found. Please select .md files or ZIP archives containing .md files.');
            return;
        }

        this.files = allMarkdownFiles;
        this.processedFiles = [];
        this.currentFileIndex = 0;
        this.zip = new JSZip();

        this.showProgressSection();
        this.updateProgress();
        this.processFiles();
    }

    async processFiles() {
        try {
            for (let i = 0; i < this.files.length; i++) {
                this.currentFileIndex = i;
                const file = this.files[i];
                
                this.updateCurrentFile(`Processing: ${file.name}`);
                this.markFileAsProcessing(i);

                const content = await this.readFileContent(file);
                const parsedFile = this.parseMarkdownFile(file.name, content);
                
                if (parsedFile) {
                    await this.addFileToZip(parsedFile);
                    this.processedFiles.push(parsedFile);
                    this.markFileAsCompleted(i);
                } else {
                    this.markFileAsError(i, 'Invalid file format');
                }

                this.updateProgress();
                
                // Small delay to allow UI updates
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            this.showDownloadSection();
            this.showResetSection();
            
        } catch (error) {
            console.error('Error processing files:', error);
            this.showError(`Error processing files: ${error.message}`);
        }
    }

    async extractZipFile(zipFile) {
        return new Promise(async (resolve, reject) => {
            try {
                const arrayBuffer = await this.readFileAsArrayBuffer(zipFile);
                const zip = new JSZip();
                const zipContent = await zip.loadAsync(arrayBuffer);
                
                const markdownFiles = [];
                const filePromises = [];
                
                // Find all markdown files in the ZIP
                zipContent.forEach((relativePath, file) => {
                    if (!file.dir && (relativePath.endsWith('.md') || relativePath.includes('.md'))) {
                        filePromises.push(
                            file.async('text').then(content => {
                                // Create a File-like object
                                const fileName = relativePath.split('/').pop(); // Get just the filename
                                const blob = new Blob([content], { type: 'text/markdown' });
                                const fileObj = new File([blob], fileName, { type: 'text/markdown' });
                                markdownFiles.push(fileObj);
                            })
                        );
                    }
                });
                
                if (filePromises.length === 0) {
                    reject(new Error('No markdown files found in ZIP archive'));
                    return;
                }
                
                await Promise.all(filePromises);
                resolve(markdownFiles);
                
            } catch (error) {
                reject(new Error(`Failed to extract ZIP file: ${error.message}`));
            }
        });
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    parseMarkdownFile(filename, content) {
        try {
            // Split content into frontmatter and body
            const lines = content.split('\n');
            
            if (lines[0] !== '---') {
                // No frontmatter, create default structure
                return {
                    filename: filename,
                    content: content,
                    tags: ['untagged'],
                    title: filename.replace('.md', ''),
                    frontmatter: {}
                };
            }

            let frontmatterEnd = -1;
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === '---') {
                    frontmatterEnd = i;
                    break;
                }
            }

            if (frontmatterEnd === -1) {
                throw new Error('Invalid frontmatter format');
            }

            const frontmatterLines = lines.slice(1, frontmatterEnd);
            const bodyLines = lines.slice(frontmatterEnd + 1);
            
            const frontmatterYaml = frontmatterLines.join('\n');
            const frontmatter = jsyaml.load(frontmatterYaml) || {};
            
            const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : 
                         frontmatter.tags ? [frontmatter.tags] : ['untagged'];

            return {
                filename: filename,
                content: content,
                tags: tags,
                title: frontmatter.title || filename.replace('.md', ''),
                frontmatter: frontmatter,
                body: bodyLines.join('\n')
            };

        } catch (error) {
            console.error(`Error parsing file ${filename}:`, error);
            return null;
        }
    }

    async addFileToZip(parsedFile) {
        const { filename, content, tags } = parsedFile;
        
        if (tags.length === 0) {
            // No tags, put in root
            this.zip.file(filename, content);
            return;
        }

        // Use first tag for the original file
        const primaryTag = tags[0];
        const primaryPath = this.sanitizePath(primaryTag);
        const primaryFilePath = `${primaryPath}/${filename}`;
        
        this.zip.file(primaryFilePath, content);

        // For additional tags, create both Windows shortcuts and markdown links
        for (let i = 1; i < tags.length; i++) {
            const tag = tags[i];
            const tagPath = this.sanitizePath(tag);
            const baseFilename = filename.replace('.md', '');
            
            // Create Windows shortcut (.url file for web links, .lnk would need binary format)
            // Since we can't create proper .lnk files in browser, we'll use .url files
            const urlFilePath = `${tagPath}/${baseFilename}.url`;
            const relativePathToOriginal = this.getRelativePath(tagPath, primaryPath);
            const urlContent = `[InternetShortcut]\nURL=file:///${relativePathToOriginal}/${filename}\n`;
            this.zip.file(urlFilePath, urlContent);
            
            // Also create a markdown file with clickable link
            const markdownLinkPath = `${tagPath}/${baseFilename} - Link.md`;
            const markdownLinkContent = `# Link to ${filename}\n\n**Original Location:** \`${primaryPath}/${filename}\`\n\n[Open Original File](../${relativePathToOriginal}/${filename})\n\n---\n\n*This is a reference file. The actual content is located at the path shown above.*\n\n## File Preview\n\n${content.length > 500 ? content.substring(0, 500) + '\n\n... (content truncated - see original file for full content)' : content}`;
            this.zip.file(markdownLinkPath, markdownLinkContent);
        }
    }

    getRelativePath(fromPath, toPath) {
        // Calculate relative path from fromPath to toPath
        const fromParts = fromPath.split('/').filter(part => part);
        const toParts = toPath.split('/').filter(part => part);
        
        // Find common prefix
        let commonLength = 0;
        while (commonLength < Math.min(fromParts.length, toParts.length) && 
               fromParts[commonLength] === toParts[commonLength]) {
            commonLength++;
        }
        
        // Go up from fromPath
        const upSteps = fromParts.length - commonLength;
        const upPath = '../'.repeat(upSteps);
        
        // Go down to toPath
        const downPath = toParts.slice(commonLength).join('/');
        
        return upPath + downPath;
    }

    sanitizePath(path) {
        // Convert tag to valid file path
        return path
            .replace(/[<>:"|?*]/g, '-') // Replace invalid characters
            .replace(/\s+/g, ' ')       // Normalize spaces
            .trim()
            .replace(/\/$/, '');        // Remove trailing slash
    }

    showProgressSection() {
        document.getElementById('progressSection').classList.remove('hidden');
        document.getElementById('downloadSection').classList.add('hidden');
        document.getElementById('errorSection').classList.add('hidden');
        
        // Create file list
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        
        this.files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item flex items-center text-sm p-2 rounded';
            fileItem.innerHTML = `
                <div class="w-4 h-4 mr-3">
                    <div class="status-indicator hidden">⏳</div>
                    <div class="success-indicator hidden">✅</div>
                    <div class="error-indicator hidden">❌</div>
                </div>
                <span class="filename">${file.name}</span>
                <span class="error-msg ml-auto text-red-600 text-xs hidden"></span>
            `;
            fileItem.id = `file-${index}`;
            fileList.appendChild(fileItem);
        });
    }

    updateProgress() {
        const total = this.files.length;
        const completed = this.currentFileIndex;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        document.getElementById('progressBar').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = `${completed} / ${total} files`;
    }

    updateCurrentFile(message) {
        document.getElementById('currentFile').textContent = message;
    }

    markFileAsProcessing(index) {
        const fileItem = document.getElementById(`file-${index}`);
        if (fileItem) {
            fileItem.classList.add('processing');
            fileItem.querySelector('.status-indicator').classList.remove('hidden');
        }
    }

    markFileAsCompleted(index) {
        const fileItem = document.getElementById(`file-${index}`);
        if (fileItem) {
            fileItem.classList.remove('processing');
            fileItem.classList.add('completed');
            fileItem.querySelector('.status-indicator').classList.add('hidden');
            fileItem.querySelector('.success-indicator').classList.remove('hidden');
        }
    }

    markFileAsError(index, errorMsg) {
        const fileItem = document.getElementById(`file-${index}`);
        if (fileItem) {
            fileItem.classList.remove('processing');
            fileItem.querySelector('.status-indicator').classList.add('hidden');
            fileItem.querySelector('.error-indicator').classList.remove('hidden');
            fileItem.querySelector('.error-msg').textContent = errorMsg;
            fileItem.querySelector('.error-msg').classList.remove('hidden');
        }
    }

    showDownloadSection() {
        document.getElementById('progressSection').classList.add('hidden');
        document.getElementById('downloadSection').classList.remove('hidden');
        
        const totalFiles = this.processedFiles.length;
        const uniqueTags = new Set();
        this.processedFiles.forEach(file => {
            file.tags.forEach(tag => uniqueTags.add(tag));
        });
        
        document.getElementById('downloadInfo').innerHTML = `
            <p>📁 ${uniqueTags.size} folders created</p>
            <p>📄 ${totalFiles} files organized</p>
        `;
        
        this.updateCurrentFile('All files processed successfully!');
    }

    showResetSection() {
        document.getElementById('resetSection').classList.remove('hidden');
    }

    showError(message) {
        document.getElementById('errorSection').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('progressSection').classList.add('hidden');
        document.getElementById('downloadSection').classList.add('hidden');
    }

    async downloadZip() {
        try {
            document.getElementById('downloadBtn').disabled = true;
            document.getElementById('downloadBtn').textContent = 'Generating ZIP...';
            
            const zipBlob = await this.zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });
            
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `notable-notes-organized-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            document.getElementById('downloadBtn').disabled = false;
            document.getElementById('downloadBtn').textContent = 'Download Organized Files';
            
        } catch (error) {
            console.error('Error generating ZIP:', error);
            this.showError(`Error generating download: ${error.message}`);
        }
    }

    reset() {
        this.files = [];
        this.processedFiles = [];
        this.zip = null;
        this.currentFileIndex = 0;
        
        document.getElementById('progressSection').classList.add('hidden');
        document.getElementById('downloadSection').classList.add('hidden');
        document.getElementById('errorSection').classList.add('hidden');
        document.getElementById('resetSection').classList.add('hidden');
        document.getElementById('fileInput').value = '';
        
        // Reset drop zone
        document.getElementById('dropZone').classList.remove('dragover');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new NotableOrganizer();
});
