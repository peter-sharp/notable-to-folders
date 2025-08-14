class NotableOrganizer {
    constructor() {
        this.files = [];
        this.attachments = new Map(); // Map to store attachment files by filename
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
                
                // Find all markdown files and attachments in the ZIP
                zipContent.forEach((relativePath, file) => {
                    if (!file.dir) {
                        if (relativePath.endsWith('.md') || relativePath.includes('.md')) {
                            // Handle markdown files
                            filePromises.push(
                                file.async('text').then(content => {
                                    const fileName = relativePath.split('/').pop();
                                    const blob = new Blob([content], { type: 'text/markdown' });
                                    const fileObj = new File([blob], fileName, { type: 'text/markdown' });
                                    markdownFiles.push(fileObj);
                                })
                            );
                        } else {
                            // Handle potential attachment files (images, documents, etc.)
                            const fileName = relativePath.split('/').pop();
                            const isLikelyAttachment = this.isLikelyAttachment(fileName);
                            
                            if (isLikelyAttachment) {
                                filePromises.push(
                                    file.async('blob').then(blob => {
                                        const fileObj = new File([blob], fileName);
                                        this.attachments.set(fileName, fileObj);
                                    })
                                );
                            }
                        }
                    }
                });
                
                if (markdownFiles.length === 0 && filePromises.length === 0) {
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

    isLikelyAttachment(filename) {
        const attachmentExtensions = [
            '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.txt', '.rtf', '.zip', '.rar', '.7z',
            '.mp3', '.wav', '.mp4', '.avi', '.mov',
            '.css', '.js', '.json', '.xml', '.csv'
        ];
        
        const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        return attachmentExtensions.includes(ext);
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
                const transformedContent = this.transformAttachmentSyntax(content, []);
                return {
                    filename: filename,
                    content: transformedContent,
                    tags: ['untagged'],
                    title: filename.replace('.md', ''),
                    frontmatter: {},
                    attachments: []
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

            // Extract attachments from frontmatter
            const attachments = Array.isArray(frontmatter.attachments) ? frontmatter.attachments : 
                               frontmatter.attachments ? [frontmatter.attachments] : [];

            // Transform @attachment syntax in the content
            const transformedContent = this.transformAttachmentSyntax(content, attachments);

            return {
                filename: filename,
                content: transformedContent,
                tags: tags,
                title: frontmatter.title || filename.replace('.md', ''),
                frontmatter: frontmatter,
                body: bodyLines.join('\n'),
                attachments: attachments
            };

        } catch (error) {
            console.error(`Error parsing file ${filename}:`, error);
            return null;
        }
    }

    async addFileToZip(parsedFile) {
        const { filename, content, tags, attachments } = parsedFile;
        
        if (tags.length === 0) {
            // No tags, put in root
            this.zip.file(filename, content);
            // Add attachments to root as well
            this.addAttachmentsToZip(attachments, '');
            return;
        }

        // Use first tag for the original file
        const primaryTag = tags[0];
        const primaryPath = this.sanitizePath(primaryTag);
        const primaryFilePath = `${primaryPath}/${filename}`;
        
        this.zip.file(primaryFilePath, content);
        
        // Add attachments only to the primary tag folder
        this.addAttachmentsToZip(attachments, primaryPath);

        // For additional tags, create markdown link files
        for (let i = 1; i < tags.length; i++) {
            const tag = tags[i];
            const tagPath = this.sanitizePath(tag);
            const baseFilename = filename.replace('.md', '');
            
            // Create a markdown file with clickable link
            const markdownLinkPath = `${tagPath}/${baseFilename} - Link.md`;
            const relativePathToOriginal = this.getRelativePath(tagPath, primaryPath);
            
            // Transform attachment references for link files to point to original location
            const linkFileContent = this.transformAttachmentSyntax(content, attachments, true, `../${relativePathToOriginal}`);
            
            const markdownLinkContent = `# Link to ${filename}\n\n**Original Location:** \`${primaryPath}/${filename}\`\n\n[Open Original File](../${relativePathToOriginal}/${filename})\n\n---\n\n*This is a reference file. The actual content is located at the path shown above.*\n\n## File Preview\n\n${linkFileContent.length > 500 ? linkFileContent.substring(0, 500) + '\n\n... (content truncated - see original file for full content)' : linkFileContent}`;
            this.zip.file(markdownLinkPath, markdownLinkContent);
        }
    }

    addAttachmentsToZip(attachments, folderPath) {
        if (!attachments || attachments.length === 0) {
            return;
        }

        attachments.forEach(attachmentName => {
            if (this.attachments.has(attachmentName)) {
                const attachmentFile = this.attachments.get(attachmentName);
                const attachmentPath = folderPath ? `${folderPath}/${attachmentName}` : attachmentName;
                this.zip.file(attachmentPath, attachmentFile);
            }
        });
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

    transformAttachmentSyntax(content, attachments, isLinkFile = false, primaryTagPath = '') {
        // Transform @attachment/filename syntax to regular markdown links
        let transformedContent = content;
        
        // Find all @attachment references in the content
        const attachmentRegex = /@attachment\/([^)\s]+)/g;
        
        transformedContent = transformedContent.replace(attachmentRegex, (match, filename) => {
            if (isLinkFile && primaryTagPath) {
                // For link files, create relative path to the original location
                return `${primaryTagPath}/${filename}`;
            } else {
                // For original files, use relative path in same directory
                return `./${filename}`;
            }
        });
        
        return transformedContent;
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
        this.attachments.clear();
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
