import React, { useState, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './PdfMarginTool.css';

const marginOptions = [100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000];

const PdfMarginTool = () => {
  const [files, setFiles] = useState([]);
  const [modifiedUrl, setModifiedUrl] = useState(null);
  const [margin, setMargin] = useState(100);
  const [marginType, setMarginType] = useState(null);
  const [pageRange, setPageRange] = useState(null);
  const [customPageRange, setCustomPageRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [processedFileBlobs, setProcessedFileBlobs] = useState([]);
  const [previewFileIndex, setPreviewFileIndex] = useState(0);

  const getZipFileName = useCallback(() => {
    if (files.length === 0) return `modified_pdfs.zip`;
    if (files.length === 1) {
      const originalFileNameWithoutExt = files[0].name.split('.').slice(0, -1).join('.');
      return `${originalFileNameWithoutExt}_margin_${margin}px.pdf`;
    }
    const firstFileNameWithoutExt = files[0]?.name.split('.').slice(0, -1).join('.') || 'multiple_pdfs';
    return `${firstFileNameWithoutExt}_and_more_pdfs_with_${margin}px_margin.zip`;
  }, [files, margin]);

  useEffect(() => {
    if (isProcessed && processedFileBlobs.length > 0) {
      updatePreviewUrl(previewFileIndex);
    }
  }, [previewFileIndex, isProcessed, processedFileBlobs]);

  // 설정 변경 시 미리보기 자동 새로고침 로직
  // isProcessing이 아닐 때만 handleProcessPdfs 호출
  useEffect(() => {
    if (files.length > 0 && marginType !== null && pageRange !== null && !isProcessing) {
      // isProcessed를 false로 설정하여 'Add Margin' 버튼이 재활성화되도록 함
      // 새로운 처리 사이클 시작을 알림
      setIsProcessed(false);
      // 디바운스: 입력 후 0.5초 대기 후 처리
      const timer = setTimeout(() => {
        handleProcessPdfs();
      }, 500);
      return () => clearTimeout(timer); // 클린업 함수
    }
  }, [margin, marginType, pageRange, customPageRange, files.length]); // files.length를 의존성으로 추가하여 파일 개수 변경 시 트리거

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

  const updatePreviewUrl = useCallback((index) => {
    if (processedFileBlobs[index]) {
      const blob = new Blob([processedFileBlobs[index].data], { type: 'application/pdf' });
      if (modifiedUrl) {
        URL.revokeObjectURL(modifiedUrl.split('#')[0]);
      }
      setModifiedUrl(URL.createObjectURL(blob) + '#' + Date.now());
    }
  }, [processedFileBlobs, modifiedUrl]);

  const handleProcessPdfs = useCallback(async () => {
    if (files.length === 0 || isProcessing || marginType === null || pageRange === null) {
      return;
    }

    setIsProcessing(true);
    setIsProcessed(false); // 처리 시작 시 isProcessed를 false로 설정
    setProcessingProgress(0);
    setModifiedUrl(null);
    setProcessedFileBlobs([]);
    setPreviewFileIndex(0);

    try {
      const tempProcessedBlobs = [];

      for (let i = 0; i < files.length; i++) {
        const fileToProcess = files[i];
        const reader = new FileReader();

        const pdfBytes = await new Promise((resolve, reject) => {
          reader.onload = async (e) => {
            try {
              const buffer = e.target.result;
              const originalPdf = await PDFDocument.load(buffer);
              const newPdf = await PDFDocument.create();
              const totalPages = originalPdf.getPageCount();

              let pagesToProcessIndices = [];

              if (pageRange === 'all') {
                pagesToProcessIndices = originalPdf.getPageIndices();
              } else if (pageRange === 'odd') {
                pagesToProcessIndices = originalPdf.getPageIndices().filter(idx => (idx + 1) % 2 !== 0);
              } else if (pageRange === 'even') {
                pagesToProcessIndices = originalPdf.getPageIndices().filter(idx => (idx + 1) % 2 === 0);
              } else if (pageRange === 'custom' && customPageRange) {
                pagesToProcessIndices = parsePageRange(customPageRange, totalPages);
              }

              for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
                const originalPage = originalPdf.getPage(pageIdx);
                const { width, height } = originalPage.getSize();
                let newPageWidth = width;
                let drawX = 0;
                const shouldAddMargin = pagesToProcessIndices.includes(pageIdx);

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
              }

              const savedPdfBytes = await newPdf.save({ useObjectStreams: false, compression: false });
              resolve(savedPdfBytes);

            } catch (error) {
              console.error(`Error processing file ${fileToProcess.name}:`, error);
              alert(`Error processing file ${fileToProcess.name}. Please check the file or try another one.`);
              reject(error);
            }
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(fileToProcess);
        });

        tempProcessedBlobs.push({ fileName: files[i].name, data: pdfBytes });
        setProcessingProgress(Math.round(((i + 1) / files.length) * 100));
      }

      setProcessedFileBlobs(tempProcessedBlobs);
      setIsProcessed(true); // 처리 완료 시 isProcessed를 true로 설정
      setIsProcessing(false);

      if (tempProcessedBlobs.length > 0) {
        updatePreviewUrl(0);
      }

    } catch (error) {
      console.error("PDF 처리 중 오류 발생:", error);
      alert("PDF 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setProcessingProgress(0);
      setModifiedUrl(null);
      setProcessedFileBlobs([]);
    } finally {
      setIsProcessing(false);
    }
  }, [files, margin, marginType, pageRange, customPageRange, parsePageRange, updatePreviewUrl, isProcessing]); // isProcessing 추가

  const handleDownload = useCallback(async () => {
    if (!isProcessed || processedFileBlobs.length === 0) {
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      if (files.length === 1) {
        const fileBlob = new Blob([processedFileBlobs[0].data], { type: 'application/pdf' });
        saveAs(fileBlob, getZipFileName());
      } else {
        const zip = new JSZip();
        processedFileBlobs.forEach(item => {
          const originalFileNameWithoutExt = item.fileName.split('.').slice(0, -1).join('.');
          zip.file(`${originalFileNameWithoutExt}-margin-${margin}px.pdf`, item.data);
        });

        const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => {
          setProcessingProgress(Math.round(metadata.percent));
        });
        saveAs(zipBlob, getZipFileName());
      }
      setIsProcessing(false);
      setProcessingProgress(100);

    } catch (error) {
      console.error("파일 다운로드 중 오류 발생:", error);
      alert("파일 다운로드 중 오류가 발생했습니다.");
      setIsProcessing(false);
    }
  }, [isProcessed, processedFileBlobs, margin, files.length, getZipFileName]);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      if (modifiedUrl) {
        URL.revokeObjectURL(modifiedUrl.split('#')[0]);
      }
      setModifiedUrl(null);
      setProcessingProgress(0);
      setIsProcessed(false); // 파일 변경 시 isProcessed 초기화
      setMarginType(null);
      setPageRange(null);
      setCustomPageRange('');
      setProcessedFileBlobs([]);
      setPreviewFileIndex(0);
    } else {
      alert('PDF 파일만 업로드할 수 있습니다.');
      setFiles([]);
      if (modifiedUrl) {
        URL.revokeObjectURL(modifiedUrl.split('#')[0]);
      }
      setModifiedUrl(null);
      setProcessingProgress(0);
      setIsProcessed(false);
      setMarginType(null);
      setPageRange(null);
      setCustomPageRange('');
      setProcessedFileBlobs([]);
      setPreviewFileIndex(0);
    }
  };

  const handleMarginChange = (value) => setMargin(value);
  const handleMarginTypeChange = (type) => setMarginType(type);
  const handlePageRangeChange = (e) => setPageRange(e.target.value);
  const handleCustomPageRangeChange = (e) => {
    setPageRange('custom');
    setCustomPageRange(e.target.value);
  };

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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
      if (droppedFiles.length > 0) {
        setFiles(droppedFiles);
        if (modifiedUrl) {
          URL.revokeObjectURL(modifiedUrl.split('#')[0]);
        }
        setModifiedUrl(null);
        setProcessingProgress(0);
        setIsProcessed(false); // 드롭 시 isProcessed 초기화
        setMarginType(null);
        setPageRange(null);
        setCustomPageRange('');
        setProcessedFileBlobs([]);
        setPreviewFileIndex(0);
      } else {
        alert('PDF 파일만 업로드할 수 있습니다.');
        setFiles([]);
        if (modifiedUrl) {
          URL.revokeObjectURL(modifiedUrl.split('#')[0]);
        }
        setModifiedUrl(null);
        setProcessingProgress(0);
        setIsProcessed(false);
        setMarginType(null);
        setPageRange(null);
        setCustomPageRange('');
        setProcessedFileBlobs([]);
        setPreviewFileIndex(0);
      }
    }
  };

  const getProcessingMessage = () => {
    if (isProcessing && !isProcessed) {
      return `Processing PDFs... ${processingProgress.toFixed(0)}%`;
    } else if (isProcessing && isProcessed) {
      return `Preparing Download... ${processingProgress.toFixed(0)}%`;
    } else if (isProcessed) {
      return 'Ready for Download';
    }
    return 'Waiting for input...';
  };

  const canInitiateProcess = files.length > 0 && marginType !== null && pageRange !== null && !isProcessing;
  const canDownload = isProcessed && !isProcessing && processedFileBlobs.length > 0;
  const canGoPrevious = previewFileIndex > 0;
  const canGoNext = previewFileIndex < processedFileBlobs.length - 1;

  useEffect(() => {
    return () => {
      if (modifiedUrl) {
        URL.revokeObjectURL(modifiedUrl.split('#')[0]);
      }
    };
  }, [modifiedUrl]);

  return (
      <div className={`body-container${isDark ? ' dark-mode' : ''}`}>
        <div className="pdf-tool">
          <button onClick={() => setIsDark(!isDark)} className="dark-toggle">
            {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
          <h2 className="title">PDF Margin Adder</h2>
          <div className={`upload-area ${isDragging ? 'drag-over' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <label className="upload-label">
              {files.length > 0 ? (
                  <>
                    {files.length} file(s) uploaded.
                  </>
              ) : (
                  'Drag & Drop PDF(s) here or Click to Upload'
              )}
              <input type="file" accept="application/pdf" onChange={handleFileChange} hidden multiple />
            </label>
            {isDragging && <div className="drag-overlay">Drop your PDF(s) here</div>}
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
            <label>
              <input type="radio" value="custom" checked={pageRange === 'custom'}
                     onChange={() => setPageRange('custom')}/>
              Custom Range
            </label>
            {pageRange === 'custom' && (
                <input
                    type="text"
                    className="custom-range-input"
                    placeholder="e.g., 1-5, 8, 10-12" // 플레이스홀더 유지
                    value={customPageRange}
                    onChange={handleCustomPageRangeChange}
                />
            )}
          </div>

          {!isProcessed ? (
              <button
                  onClick={handleProcessPdfs}
                  disabled={!canInitiateProcess}
                  className="action-btn"
              >
                {isProcessing ? (
                    <div className="processing-indicator">
                      <span className="spinner"></span> {getProcessingMessage()}
                    </div>
                ) : (
                    'Add Margin'
                )}
              </button>
          ) : (
              <button
                  onClick={handleDownload}
                  disabled={!canDownload}
                  className="action-btn"
              >
                {isProcessing ? (
                    <div className="processing-indicator">
                      <span className="spinner"></span> {getProcessingMessage()}
                    </div>
                ) : (
                    files.length === 1 ? 'Download PDF' : 'Download All PDFs as ZIP'
                )}
              </button>
          )}

          {modifiedUrl && isProcessed && !isProcessing && (
              <div className="preview-container">
                <p>Preview of {files[previewFileIndex]?.name || 'Processed PDF'} (File {previewFileIndex + 1} of {files.length}):</p>
                <div className="preview-navigation">
                  {/* 파일이 1개일 때는 '이전'/'다음' 버튼을 숨김 */}
                  {files.length > 1 && (
                      <button onClick={() => setPreviewFileIndex(prev => prev - 1)} disabled={!canGoPrevious}>
                        &lt; Previous
                      </button>
                  )}
                  <iframe className="pdf-preview fade-in" src={modifiedUrl} title="Modified PDF Preview" />
                  {files.length > 1 && (
                      <button onClick={() => setPreviewFileIndex(prev => prev + 1)} disabled={!canGoNext}>
                        Next &gt;
                      </button>
                  )}
                </div>
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