import React, { useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import './PdfMarginTool.css';

const marginOptions = [100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000];

const PdfMarginTool = () => {
  const [file, setFile] = useState(null);
  const [modifiedUrl, setModifiedUrl] = useState(null);
  const [margin, setMargin] = useState(100);
  const [marginType, setMarginType] = useState(null);
  const [pageRange, setPageRange] = useState(null);
  const [customPageRange, setCustomPageRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const parsePageRange = useCallback((rangeString, totalPages) => {
    const pagesToProcess = new Set();
    const parts = rangeString.split(',').map(part => part.trim());
    parts.forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= totalPages) {
            pagesToProcess.add(i - 1);
          }
        }
      } else {
        const pageNum = Number(part);
        if (pageNum >= 1 && pageNum <= totalPages) {
          pagesToProcess.add(pageNum - 1);
        }
      }
    });
    return Array.from(pagesToProcess).sort((a, b) => a - b);
  }, []);

  const handleProcessPdf = useCallback(async () => {
    if (!file || isProcessing || marginType === null || pageRange === null) {
      if (!file) setModifiedUrl(null);
      return;
    }

    setIsProcessing(true);
    setIsProcessed(false);
    setModifiedUrl(null);
    setUploadProgress(0);

    try {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 50);
          setUploadProgress(percent);
        }
      };
      reader.onload = async (e) => {
        const buffer = e.target.result;
        const originalPdf = await PDFDocument.load(buffer);
        const newPdf = await PDFDocument.create();
        const totalPages = originalPdf.getPageCount();

        let pagesToProcessIndices = originalPdf.getPageIndices();

        if (pageRange === 'odd') {
          pagesToProcessIndices = pagesToProcessIndices.filter(index => (index + 1) % 2 !== 0);
        } else if (pageRange === 'even') {
          pagesToProcessIndices = pagesToProcessIndices.filter(index => (index + 1) % 2 === 0);
        } else if (pageRange === 'custom' && customPageRange) {
          const parsedIndices = parsePageRange(customPageRange, totalPages);
          pagesToProcessIndices = originalPdf.getPageIndices().filter(idx => parsedIndices.includes(idx));
        }

        for (let i = 0; i < totalPages; i++) {
          const originalPage = originalPdf.getPage(i);
          const { width, height } = originalPage.getSize();
          let newPageWidth = width;
          let drawX = 0;
          const shouldAddMargin = pagesToProcessIndices.includes(i);

          if (shouldAddMargin) {
            if (marginType === 'left') {
              newPageWidth = width + margin;
              drawX = margin;
            } else if (marginType === 'right') {
              newPageWidth = width + margin;
              drawX = 0;
            } else if (marginType === 'both') {
              newPageWidth = width + margin * 2;
              drawX = margin;
            }
          }

          const newPage = newPdf.addPage([newPageWidth, height]);
          const embeddedPage = await newPdf.embedPage(originalPage);
          newPage.drawPage(embeddedPage, { x: drawX, y: 0 });

          setUploadProgress(50 + Math.round(((i + 1) / totalPages) * 50));
        }

        const pdfBytes = await newPdf.save({ useObjectStreams: false, compression: false });

        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setModifiedUrl(url + '#' + Date.now());
        setUploadProgress(100);
        setIsProcessed(true);
        setIsProcessing(false);
      };
      reader.readAsArrayBuffer(file);

    } catch (error) {
      console.error("PDF 처리 중 오류 발생:", error);
      alert("PDF 처리 중 오류가 발생했습니다. 파일을 확인하거나 다른 파일로 시도해주세요.");
      setModifiedUrl(null);
      setUploadProgress(0);
      setIsProcessing(false);
      setIsProcessed(false);
    }
  }, [file, margin, marginType, pageRange, customPageRange, isProcessing, parsePageRange]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setModifiedUrl(null);
      setUploadProgress(0);
      setIsProcessed(false);
      setMarginType(null);
      setPageRange(null);
      setCustomPageRange('');
    } else {
      alert('PDF 파일만 업로드할 수 있습니다.');
      setFile(null);
      setModifiedUrl(null);
      setUploadProgress(0);
      setIsProcessed(false);
      setMarginType(null);
      setPageRange(null);
      setCustomPageRange('');
    }
  };

  const handleMarginChange = (value) => setMargin(value);
  const handleMarginTypeChange = (type) => setMarginType(type);
  const handlePageRangeChange = (e) => setPageRange(e.target.value);
  const handleCustomPageRangeChange = (e) => setCustomPageRange(e.target.value);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
        setModifiedUrl(null);
        setUploadProgress(0);
        setIsProcessed(false);
        setMarginType(null);
        setPageRange(null);
        setCustomPageRange('');
      } else {
        alert('PDF 파일만 업로드할 수 있습니다.');
        setFile(null);
        setModifiedUrl(null);
        setUploadProgress(0);
        setIsProcessed(false);
        setMarginType(null);
        setPageRange(null);
        setCustomPageRange('');
      }
    }
  };

  const getProcessingMessage = () => {
    if (uploadProgress === 0 && isProcessing) return 'Starting...';
    if (uploadProgress > 0 && uploadProgress <= 50) return `Uploading file... ${uploadProgress}%`;
    if (uploadProgress > 50 && uploadProgress < 100) return `Processing PDF... ${uploadProgress}%`;
    if (uploadProgress === 100 && isProcessed) return 'Done!';
    return 'Processing...';
  };

  const getDownloadFileName = () => {
    if (!file) return `modified-pdf.pdf`;
    const originalFileNameWithoutExt = file.name.split('.').slice(0, -1).join('.');
    return `<span class="math-inline">\{originalFileNameWithoutExt\}\-margin\-</span>{margin}px.pdf`;
  };

  const handleActionButtonClick = () => {
    if (isProcessed && modifiedUrl) {
      const link = document.createElement('a');
      link.href = modifiedUrl;
      link.download = getDownloadFileName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      handleProcessPdf();
    }
  };

  return (
      <div className={`body-container${isDark ? ' dark-mode' : ''}`}> {/* 새로운 body-container div 추가 */}
        <div className="pdf-tool"> {/* 기존 pdf-tool div는 그대로 유지 */}
          <button onClick={() => setIsDark(!isDark)} className="dark-toggle">
            {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
          <h2 className="title">PDF Margin Adder</h2>
          <div className={`upload-area ${isDragging ? 'drag-over' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <label className="upload-label">
              {file ? (
                  <>
                    File: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                  </>
              ) : (
                  'Drag & Drop PDF here or Click to Upload'
              )}
              <input type="file" accept="application/pdf" onChange={handleFileChange} hidden />
            </label>
            {isDragging && <div className="drag-overlay">Drop your PDF here</div>}
          </div>

          <div className="margin-options">
            <span className="margin-label">Choose margin size:</span>
            {marginOptions.map((value) => (
                <button key={value} onClick={() => handleMarginChange(value)} className={`margin-btn${value === margin ? ' active' : ''}`}>{value}px</button>
            ))}
          </div>

          <div className="margin-type-options">
            <span className="margin-label">Choose margin position:</span>
            <label><input type="radio" value="left" checked={marginType === 'left'} onChange={() => handleMarginTypeChange('left')} /> Left</label>
            <label><input type="radio" value="right" checked={marginType === 'right'} onChange={() => handleMarginTypeChange('right')} /> Right</label>
            <label><input type="radio" value="both" checked={marginType === 'both'} onChange={() => handleMarginTypeChange('both')} /> Both</label>
          </div>

          <div className="page-range-options">
            <span className="margin-label">Apply to pages:</span>
            <label><input type="radio" value="all" checked={pageRange === 'all'} onChange={handlePageRangeChange} /> All Pages</label>
            <label><input type="radio" value="odd" checked={pageRange === 'odd'} onChange={handlePageRangeChange} /> Odd Pages</label>
            <label><input type="radio" value="even" checked={pageRange === 'even'} onChange={handlePageRangeChange} /> Even Pages</label>
            <label><input type="radio" value="custom" checked={pageRange === 'custom'} onChange={handlePageRangeChange} /> Custom Range</label>
            {pageRange === 'custom' && (
                <input type="text" className="custom-range-input" placeholder="e.g., 1-5, 8" value={customPageRange} onChange={handleCustomPageRangeChange} />
            )}
          </div>

          <button
              onClick={handleActionButtonClick}
              disabled={!file || isProcessing || marginType === null || pageRange === null}
              className="action-btn"
          >
            {isProcessing ? (
                <div className="processing-indicator">
                  <span className="spinner"></span> {getProcessingMessage()}
                </div>
            ) : isProcessed ? (
                'Download PDF'
            ) : (
                'Add Margin & Preview'
            )}
          </button>

          {modifiedUrl && !isProcessing && isProcessed && (
              <div className="preview-container">
                <iframe className="pdf-preview fade-in" src={modifiedUrl} title="Modified PDF Preview" />
              </div>
          )}

          <footer className="footer">
            <p>copyright ⓒ 2025 All rights reserved by <a href="https://github.com/choiyeseo" target="_blank" rel="noopener noreferrer">choiyeseo</a></p>
          </footer>
        </div>
      </div>
  );
};

export default PdfMarginTool;