export const en = {
  // Common
  common: {
    backToHome: 'Back to Home',
    home: 'Home',
    loading: 'Loading...',
    loadingMap: 'Loading map...',
    error: 'Error',
    success: 'Success',
    submit: 'Submit',
    cancel: 'Cancel',
    clear: 'Clear',
    clearAll: 'Clear All',
    remove: 'Remove',
    delete: 'Delete',
    save: 'Save',
    download: 'Download',
    upload: 'Upload',
    process: 'Process',
    processing: 'Processing...',
    send: 'Send',
    close: 'Close',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    search: 'Search',
    reset: 'Reset',
    next: 'Next',
    previous: 'Previous',
    view: 'View',
    details: 'Details',
    realTimeData: 'Real-time Data',
    osmPowered: 'OpenStreetMap Powered',
    professionalTools: 'Professional Tools',
    copyright: '© 2025 Civil Construction Platform. Built with Next.js',
    retry: 'Try Again',
    thinking: 'Thinking...',
  },

  // Home Page
  home: {
    adminLogin: 'Admin Login',
    badge: 'Infrastructure Analysis Platform',
    title: 'Civil Construction',
    subtitle: 'Advanced tools for infrastructure mapping, analysis, and construction project management',
    
    // Demo App
    demoTitle: 'Demo App',
    demoDescription: 'Complete workflow demonstration: Upload documents, analyze CAD files, explore infrastructure, and extract text with OCR',
    startDemo: 'Start Demo',

    // Infrastructure Explorer
    explorerTitle: 'Infrastructure Explorer',
    explorerDescription: 'Explore and analyze infrastructure data including buildings, roads, railways, and waterways using OpenStreetMap technology',
    launchExplorer: 'Launch Explorer',

    // Document OCR
    ocrTitle: 'Document OCR',
    ocrDescription: 'Extract text from construction documents and blueprints using advanced OCR with multiple engine options',
    startOCR: 'Start OCR',

    // Regulations Chatbot
    chatbotTitle: 'Regulations Chatbot',
    chatbotDescription: 'Ask questions about building codes and regulations from national and regional sources',
    askQuestions: 'Ask Questions',

    // AutoCAD Analyzer
    cadTitle: 'AutoCAD Analyzer',
    cadDescription: 'Extract geometry from DXF files to automatically calculate Site Area, Building Footprint, and Floor Area Ratios (BCR/FAR) with interactive layer filtering.',
    startAnalysis: 'Start Analysis',

    // API Documentation
    apiTitle: 'API Documentation',
    apiDescription: 'Comprehensive API documentation for integrating civil construction data and services into your applications',
    viewDocs: 'View Documentation',
  },

  // Admin
  admin: {
    login: {
      title: 'Admin Login',
      subtitle: 'Access the administration dashboard',
      email: 'Email Address',
      emailPlaceholder: 'admin@example.com',
      password: 'Password',
      passwordPlaceholder: '••••••••',
      loginButton: 'Login',
      loggingIn: 'Logging in...',
      invalidCredentials: 'Invalid email or password',
    },
    dashboard: {
      title: 'Admin Dashboard',
      logout: 'Logout',
      loadingDashboard: 'Loading dashboard...',
      sessions: 'Sessions',
      totalSessions: 'Total Sessions',
      uniqueUsers: 'Unique Users',
      totalDocuments: 'Total Documents',
      ocrRecords: 'OCR Records',
      noSessions: 'No sessions found',
      noSessionsYet: 'No demo sessions yet',
      viewDetails: 'View Details',
      delete: 'Delete',
      deleteSession: 'Delete Session',
      deleteConfirm: 'Are you sure you want to delete this session? This action cannot be undone.',
      deleteSuccess: 'Session deleted successfully',
      deleteFailed: 'Failed to delete session',
      sessionId: 'Session ID',
      userId: 'User ID',
      createdAt: 'Created At',
      lastUpdated: 'Last Updated',
      documents: 'Documents',
      cadData: 'CAD Data',
      infrastructureData: 'Infrastructure Data',
      infrastructure: 'Infrastructure',
      ocrData: 'OCR Data',
      actions: 'Actions',
      sessionsHistory: 'Demo Sessions History',
      files: 'files',
      records: 'records',
      saved: 'Saved',
      none: 'None',
      sessionDetails: 'Session Details',
      basicInfo: 'Basic Information',
      view: 'View',
      cadAnalysisData: 'CAD Analysis Data',
      siteArea: 'Site Area',
      buildingArea: 'Building Area',
      floorArea: 'Floor Area',
      bcrFull: 'BCR (Building Coverage Ratio)',
      farFull: 'FAR (Floor Area Ratio)',
      ratio: 'ratio',
      dxfFile: 'DXF File',
      download: 'Download',
      openViewer: 'Open Viewer',
      cadDrawingFile: 'CAD Drawing File',
      dxfFormat: 'DXF Format • Click "Open Viewer" to visualize',
      latitude: 'Latitude',
      longitude: 'Longitude',
      radius: 'Radius',
      labeledFeatures: 'Labeled Features',
      mapView: 'Map View (Read-only)',
      refreshMap: 'Refresh Map',
      viewFile: 'View File',
      loadingMap: 'Loading map...',
    },
  },

  // OCR Page
  ocr: {
    title: 'Document OCR',
    subtitle: 'Extract text from images using advanced OCR technology',
    uploadTitle: 'Upload Image',
    dragDrop: 'Drag and drop your image here',
    orClick: 'or click to browse',
    selectImage: 'Select Image',
    supportedFormats: 'Supported formats: JPG, PNG, BMP, TIFF',
    removeImage: 'Remove Image',
    
    options: {
      title: 'OCR Options',
      preprocessing: 'Preprocessing',
      preprocessingDesc: 'Apply rotation and skew correction',
      engineTitle: 'OCR Engine',
      surya: 'Surya OCR',
      suryaDesc: 'Full layout + tables + text (all languages)',
      paddle: 'PaddleOCR',
      paddleDesc: 'Text recognition (Korean + Latin only)',
      hybrid: 'Hybrid Mode',
      hybridDesc: 'Surya layout + PaddleOCR text',
      recommended: 'RECOMMENDED',
    },
    
    process: 'Process Image',
    
    results: {
      success: 'OCR Completed Successfully',
      foundLines: 'Found {count} text lines',
      failed: 'OCR Failed',
      preprocessedImage: 'Preprocessed Image',
      rotationApplied: 'Rotation applied: {degrees}°',
      extractedText: 'Extracted Text',
      noTextDetected: 'No text detected',
      jsonResults: 'JSON Results',
      downloadTxt: 'Download TXT',
      downloadJson: 'Download JSON',
      placeholder: 'Upload an image and click "Process Image" to see results',
      processingMessage: 'Processing your image...',
      processingNote: 'This may take a few moments depending on image size',
    },
  },

  // CAD Page
  cad: {
    title: 'AutoCAD Analyzer',
    subtitle: 'Automated geometry extraction and BCR/FAR calculation',
    resetAnalysis: 'Reset Analysis',
    
    upload: {
      title: 'Upload DXF File',
      dragDrop: 'Drag and drop your DXF file here',
      orClick: 'or click to browse',
      selectFile: 'Select DXF File',
      supportedFormats: 'Supported: .dxf files only',
    },
    
    layers: {
      title: 'Select Layers',
      selectAll: 'Select All',
      deselectAll: 'Deselect All',
      selected: '{count} layers selected',
      processButton: 'Process File',
    },
    
    tools: {
      title: 'Selection Tools',
      siteSelection: 'Site Selection',
      buildingFootprint: 'Building Footprint',
      floorCount: 'Floor Count',
      floors: 'floors',
    },
    
    metrics: {
      siteArea: 'Site Area',
      buildingFootprint: 'Building Footprint',
      totalFloorArea: 'Total Floor Area',
      bcr: 'BCR',
      far: 'FAR',
      bcrFull: 'Building Coverage Ratio',
      farFull: 'Floor Area Ratio',
    },
    
    viewer: {
      noData: 'No CAD data loaded',
      clickToSelect: 'Click on polygons to select them',
    },
  },

  // Map Page
  map: {
    title: 'Infrastructure Explorer',
    subtitle: 'Explore infrastructure data using OpenStreetMap',
    
    search: {
      placeholder: 'Search location or enter coordinates (lat, lon)',
      button: 'Search',
      notFound: 'Location not found',
    },
    
    radius: 'Radius',
    meters: 'meters',
    
    fetch: {
      button: 'Fetch Infrastructure Data',
      loading: 'Loading...',
      success: 'Successfully loaded {count} infrastructure features.',
    },
    
    building: {
      types: 'Building Types',
      hospital: 'Hospital',
      school: 'School',
      residential: 'Residential Housing',
      river: 'River',
      lake: 'Lake',
      office: 'Office',
      others: 'Others',
    },
    
    labels: {
      selectType: 'Select Type',
      customType: 'Custom Type',
      customTypePlaceholder: 'Enter custom type...',
      saveSelection: 'Save Selection',
      selectedFeatures: 'Selected Features',
      noFeatures: 'No features selected',
      submitFeatures: 'Submit Selected Features',
    },
    
    ai: {
      title: 'AI Building Detection',
      description: 'Use AI to automatically detect and classify buildings',
      analyze: 'Analyze with AI',
    },
  },

  // Chatbot Page
  chatbot: {
    title: 'Building Regulations Assistant',
    subtitle: 'Ask questions about building regulations and construction standards',
    
    searchMode: {
      title: 'Search Mode',
      current: 'Current',
      auto: 'Auto',
      autoDesc: 'Smart search (tries similarity first, then LLM)',
      similarity: 'Similarity',
      similarityDesc: 'Vector-based semantic search',
      llmGenerated: 'LLM Query',
      llmGeneratedDesc: 'AI-generated database queries',
    },
    
    searchMethods: {
      similarity: '🔍 Similarity',
      llmGenerated: '🤖 LLM Query',
      directMatch: '📊 Direct Match',
      fulltext: '🔎 Fulltext',
    },
    
    input: {
      placeholder: 'Ask about regulations, standards, or specific articles...',
      send: 'Send',
      clear: 'Clear',
      hint: 'Press Enter to send, Shift+Enter for new line',
    },
    
    messages: {
      sources: 'Sources',
      suggestedQuestions: 'Suggested questions',
      error: 'Sorry, I encountered an error. Please try again.',
    },
  },

  // Result Section
  result: {
    loading: 'Checking compliance...',
    loadingDesc: 'Analyzing your data against building regulations',
    error: 'Error',
    complianceScore: 'Compliance Score',
    actual: 'Actual',
    required: 'Required',
    askMoreDetails: 'Ask for More Details',
    startNew: 'Start New Analysis',
    
    status: {
      accepted: 'Accepted',
      rejected: 'Rejected',
      reviewRequired: 'Review Required',
    },
    
    tabs: {
      checks: 'Compliance Checks',
      regulations: 'Applicable Regulations',
      recommendations: 'Recommendations',
    },
  },

  // Result Chatbot
  resultChatbot: {
    title: 'Compliance Assistant',
    subtitle: 'Ask questions about your compliance result',
    pageTitle: 'Ask About Your Result',
    pageSubtitle: 'Get detailed explanations about your compliance result',
    
    greetingAccepted: 'Congratulations! Your building project has been approved. I can help you understand the compliance details or answer any questions about the regulations that apply to your project.',
    greetingRejected: 'Your building project needs some modifications to meet the regulations. I can help you understand which requirements were not met and how to address them.',
    greetingReview: 'Your building project requires additional review. I can help explain which areas need attention and what steps you can take next.',
    
    placeholder: 'Ask about your compliance result...',
    sources: 'Referenced Regulations:',
    suggestedQuestions: 'Suggested questions:',
    error: 'Sorry, I encountered an error. Please try again.',
  },

  // Demo Page
  demo: {
    title: 'Complete Demo Workflow',
    subtitle: 'Experience the full system: Document OCR → CAD Analysis → Infrastructure Mapping',
    
    steps: {
      ocr: 'OCR',
      cad: 'CAD',
      infrastructure: 'Infrastructure',
      result: 'Result',
      complete: 'Complete',
    },
    
    session: {
      userId: 'User ID',
      sessionId: 'Session ID',
      initError: 'Failed to initialize demo session',
    },
    
    ocr: {
      title: 'Upload Documents',
      uploadInstructions: 'Upload documents for each category. Process OCR for each document type individually.',
      dragDrop: 'Drag and drop files here',
      orClick: 'or click to browse',
      selectFiles: 'Select Files',
      supportedFormats: 'Supported: PDF, DOC, DOCX, JPG, PNG',
      filesSelected: '{count} file(s) selected',
      clearAll: 'Clear All',
      options: 'OCR Options',
      preprocessing: 'Preprocessing',
      preprocessingDesc: 'Apply rotation and skew correction',
      engineTitle: 'OCR Engine',
      surya: 'Surya OCR',
      suryaDesc: 'Full layout + tables + text (all languages)',
      paddle: 'PaddleOCR',
      paddleDesc: 'Text recognition (Korean + Latin only)',
      hybrid: 'Hybrid Mode',
      hybridDesc: 'Surya layout + PaddleOCR text',
      recommended: 'RECOMMENDED',
      processDocuments: 'Process OCR',
      processingDocuments: 'Processing {count} document(s)...',
      completed: 'OCR Completed',
      processedCount: 'Processed {count} document(s)',
      document: 'Document',
      originalImage: 'Original Image',
      preprocessedImage: 'Preprocessed Image',
      rotationApplied: 'Rotation applied: {degrees}°',
      extractedText: 'Extracted Text',
      noTextDetected: 'No text detected',
      foundLines: 'Found {count} text lines',
      jsonResults: 'JSON Results',
      downloadTxt: 'Download TXT',
      downloadJson: 'Download JSON',
      ocrFailed: 'OCR Failed',
      uploadToSee: 'Upload documents to see results',
      retryUpload: 'Clear & Retry',
      required: 'Required',
      requiredEither: 'Required (Either)',
      optional: 'Optional',
      maxFiles: 'Max {count} files',
      singleFile: '1 file',
      requirementsNotMet: 'Requirements not met',
      isRequired: 'is required',
      eitherRequired: 'Either Sale/Transfer Confirmation or Ownership/Rights Proof is required',
      docTypes: {
        landScope: 'Land Scope Documents',
        saleTransfer: 'Sale/Transfer Confirmation',
        ownershipRights: 'Ownership/Rights Proof',
        coOwnerConsent: 'Co-owner Consent, Share Verification & Building Overview',
        preDecision: 'Pre-Decision Document',
        otherPermit: 'Other Permit Forms',
        combinedAgreement: 'Combined Agreement',
      },
    },
    
    cad: {
      title: 'CAD Analysis',
      uploadTitle: 'Upload Project File',
      dragDrop: 'Drag & Drop DXF File',
      supportedFormats: 'Supported formats: .dxf',
      browseFiles: 'Browse Files',
      scanningGeometry: 'Scanning DXF Geometry...',
      
      parserMode: {
        title: 'Parser Mode',
        manual: 'Manual',
        manualDesc: 'Select layers manually and label polygons',
        python: 'Python Parser',
        pythonDesc: 'Automatic detection via layer naming conventions',
        llm: 'AI Parser',
        llmDesc: 'GPT-powered intelligent layer detection',
        recommended: 'RECOMMENDED',
      },
      
      layers: {
        title: 'Select Layers',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        selected: '{count} layers selected',
        processFile: 'Process File',
        activeLayers: 'Active Layers',
        updateGeometry: 'Update Geometry',
      },
      
      tools: {
        mode: 'Mode',
        siteArea: 'Site Area',
        building: 'Building',
        floors: 'Floors',
        type: 'Type',
        footprint: 'Footprint',
        upperFloor: 'Upper Floor',
      },
      
      metrics: {
        siteArea: 'Site Area',
        building: 'Building',
        totalFloor: 'Total Floor',
        bcr: 'BCR',
        far: 'FAR',
        autoCalculated: 'Auto Calculated',
        aiCalculated: 'AI Calculated',
      },
      
      standardization: {
        title: 'CAD Document Standardization Requirements',
        warning: 'To ensure the Python Parser correctly interprets geometry and units, your DWG/DXF file must follow these standards.',
        globalSettings: 'Global Settings',
        drawingUnits: 'Drawing Units',
        millimeters: 'Millimeters (mm)',
        systemVariable: 'System Variable',
        geometryType: 'Geometry Type',
        closedPolylines: 'All areas must be drawn using Closed Polylines (LWPOLYLINE)',
        prohibitedNames: 'Prohibited Layer Names',
        prohibitedNamesDesc: 'Do not use single digits (1, 2, 3...8) as layer names',
        layerNaming: 'Mandatory Layer Naming Convention',
        siteBoundary: 'Site Boundary',
        siteBoundaryKr: '대지경계',
        requiredKeywords: 'Required Keywords',
        recommendedLayer: 'Recommended',
        buildingFootprint: 'Building Footprint',
        buildingFootprintKr: '건축면적',
        floorAreaLayers: 'Floor Area Layers',
        floorAreaLayersKr: '층별면적',
        namingPattern: 'Naming Pattern',
        allowedSuffixes: 'Allowed Suffixes',
        materialSpecs: 'Material Specifications',
        materialSpecsKr: '재료명세',
        textKeywords: 'Text Keywords',
        quickReference: 'Quick Reference',
        element: 'Element',
        standardLayer: 'Standard Layer',
        triggerKeyword: 'Trigger Keyword',
        checklistTitle: 'Please confirm you have checked the following:',
        checkUnits: 'My DXF file uses millimeters (mm) as drawing units (INSUNITS = 4)',
        checkPolylines: 'All areas are drawn using closed polylines (LWPOLYLINE)',
        checkSite: 'Site boundary layer includes keywords: SITE, BOUNDARY, LND, 대지, or 지적',
        checkFootprint: 'Building footprint layer includes keywords: FOOTPRINT, HH, or 건축면적',
        checkFloors: 'Floor layers follow naming pattern: 1F, 2F, B1F (or similar with FLR/FLOOR/층)',
        allChecked: 'All requirements checked',
        pleaseCheckAll: 'Please check all items to continue',
        understand: 'I Understand & Continue',
      },
    },
    
    infrastructure: {
      title: 'Infrastructure Mapping',
      searchLocation: 'Search Location',
      searchPlaceholder: 'Jakarta, Indonesia or -6.358, 106.835',
      searchRadius: 'Search Radius',
      fetchData: 'Fetch Data',
      loading: 'Loading',
      successLoaded: 'Successfully loaded {count} infrastructure features.',
      noFeaturesFound: 'No infrastructure features found in this area. Try increasing the search radius or searching a different location.',
      
      buildingTypes: {
        title: 'Building Types',
        hospital: 'Hospital',
        school: 'School',
        residential: 'Residential Housing',
        river: 'River',
        lake: 'Lake',
        office: 'Office',
        others: 'Others',
      },
      
      legend: {
        water: 'Water',
        roads: 'Roads',
        buildings: 'Buildings',
        railways: 'Railways',
      },
      
      modal: {
        assignType: 'Assign Building Type',
        changeType: 'Change Building Type',
        selectTypePrompt: 'Select a type to classify this feature',
        changeTypePrompt: 'Click a different type to change the classification',
        selectType: 'Select Type',
        customTypeName: 'Custom Type Name',
        customTypePlaceholder: 'Enter custom type name...',
        preview: 'Preview',
        updateType: 'Update Type',
        assignTypeBtn: 'Assign Type',
      },
      
      submission: {
        confirmTitle: 'Confirm Submission',
        confirmMessage: 'Are you sure you want to submit {count} labeled feature(s)?',
        labeledFeatures: 'Labeled Features',
        submitting: 'Submitting...',
        yesSubmit: 'Yes, Submit',
        submitBtn: 'Submit Labeled Features',
        classified: '{count} building(s) classified',
        savedSuccess: 'Infrastructure data saved successfully!',
        saveWarning: 'Warning: Infrastructure data may not have been saved properly',
        saveFailed: 'Failed to submit infrastructure data',
        unlabeled: 'Unlabeled',
      },
    },
    
    complete: {
      title: 'Demo Completed!',
      message: 'All workflow steps completed successfully. Your data has been saved with User ID:',
      summary: 'Summary',
      ocrProcessing: 'OCR Processing',
      ocrResult: '{success} of {total} document(s) processed successfully',
      cadAnalysis: 'CAD Analysis',
      cadResult: 'CAD geometry processed and analyzed successfully',
      infraMapping: 'Infrastructure Mapping',
      infraResult: 'Infrastructure features labeled and analyzed',
      startNew: 'Start New Demo',
    },
    
    navigation: {
      skipStep: 'Skip this step',
      continueToCAD: 'Continue to CAD Analysis →',
      continueToInfra: 'Continue to Infrastructure →',
      backToHome: 'Back to Home',
    },
  },

  // Language Switcher
  language: {
    title: 'Language',
    english: 'English',
    korean: '한국어',
  },
};

export type TranslationKeys = typeof en;
