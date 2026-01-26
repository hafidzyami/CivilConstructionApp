import { TranslationKeys } from './en';

export const ko: TranslationKeys = {
  // Common
  common: {
    backToHome: '홈으로 돌아가기',
    home: '홈',
    loading: '로딩 중...',
    loadingMap: '지도 로딩 중...',
    error: '오류',
    success: '성공',
    submit: '제출',
    cancel: '취소',
    clear: '지우기',
    clearAll: '모두 지우기',
    remove: '제거',
    delete: '삭제',
    save: '저장',
    download: '다운로드',
    upload: '업로드',
    process: '처리',
    processing: '처리 중...',
    send: '보내기',
    close: '닫기',
    confirm: '확인',
    yes: '예',
    no: '아니오',
    search: '검색',
    reset: '초기화',
    next: '다음',
    previous: '이전',
    view: '보기',
    details: '상세정보',
    realTimeData: '실시간 데이터',
    osmPowered: 'OpenStreetMap 기반',
    professionalTools: '전문 도구',
    copyright: '© 2025 토목 건설 플랫폼. Next.js로 제작',
  },

  // Home Page
  home: {
    adminLogin: '관리자 로그인',
    badge: '인프라 분석 플랫폼',
    title: '토목 건설',
    subtitle: '인프라 매핑, 분석 및 건설 프로젝트 관리를 위한 고급 도구',
    
    // Demo App
    demoTitle: '데모 앱',
    demoDescription: '완전한 워크플로우 시연: 문서 업로드, CAD 파일 분석, 인프라 탐색 및 OCR을 통한 텍스트 추출',
    startDemo: '데모 시작',

    // Infrastructure Explorer
    explorerTitle: '인프라 탐색기',
    explorerDescription: 'OpenStreetMap 기술을 사용하여 건물, 도로, 철도 및 수로를 포함한 인프라 데이터 탐색 및 분석',
    launchExplorer: '탐색기 시작',

    // Document OCR
    ocrTitle: '문서 OCR',
    ocrDescription: '다양한 OCR 엔진 옵션을 사용하여 건설 문서 및 도면에서 텍스트 추출',
    startOCR: 'OCR 시작',

    // Regulations Chatbot
    chatbotTitle: '건축 규정 챗봇',
    chatbotDescription: '국가 및 지역 규정에서 건축 법규 및 규정에 대한 질문하기',
    askQuestions: '질문하기',

    // AutoCAD Analyzer
    cadTitle: 'AutoCAD 분석기',
    cadDescription: 'DXF 파일에서 기하학적 데이터를 추출하여 대지 면적, 건축 면적 및 용적률(BCR/FAR)을 자동으로 계산하고 대화형 레이어 필터링 지원.',
    startAnalysis: '분석 시작',

    // API Documentation
    apiTitle: 'API 문서',
    apiDescription: '토목 건설 데이터 및 서비스를 애플리케이션에 통합하기 위한 종합 API 문서',
    viewDocs: '문서 보기',
  },

  // Admin
  admin: {
    login: {
      title: '관리자 로그인',
      subtitle: '관리 대시보드에 접근',
      email: '이메일 주소',
      emailPlaceholder: 'admin@example.com',
      password: '비밀번호',
      passwordPlaceholder: '••••••••',
      loginButton: '로그인',
      loggingIn: '로그인 중...',
      invalidCredentials: '이메일 또는 비밀번호가 잘못되었습니다',
    },
    dashboard: {
      title: '관리자 대시보드',
      logout: '로그아웃',
      loadingDashboard: '대시보드 로딩 중...',
      sessions: '세션',
      totalSessions: '총 세션',
      uniqueUsers: '고유 사용자',
      totalDocuments: '총 문서',
      ocrRecords: 'OCR 기록',
      noSessions: '세션을 찾을 수 없습니다',
      noSessionsYet: '데모 세션이 없습니다',
      viewDetails: '상세 보기',
      delete: '삭제',
      deleteSession: '세션 삭제',
      deleteConfirm: '이 세션을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.',
      deleteSuccess: '세션이 성공적으로 삭제되었습니다',
      deleteFailed: '세션 삭제에 실패했습니다',
      sessionId: '세션 ID',
      userId: '사용자 ID',
      createdAt: '생성일',
      lastUpdated: '최종 수정일',
      documents: '문서',
      cadData: 'CAD 데이터',
      infrastructureData: '인프라 데이터',
      infrastructure: '인프라',
      ocrData: 'OCR 데이터',
      actions: '작업',
      sessionsHistory: '데모 세션 기록',
      files: '파일',
      records: '기록',
      saved: '저장됨',
      none: '없음',
      sessionDetails: '세션 상세',
      basicInfo: '기본 정보',
      view: '보기',
      cadAnalysisData: 'CAD 분석 데이터',
      siteArea: '대지 면적',
      buildingArea: '건축 면적',
      floorArea: '연면적',
      bcrFull: 'BCR (건폐율)',
      farFull: 'FAR (용적률)',
      ratio: '비율',
      dxfFile: 'DXF 파일',
      download: '다운로드',
      openViewer: '뷰어 열기',
      cadDrawingFile: 'CAD 도면 파일',
      dxfFormat: 'DXF 형식 • "뷰어 열기"를 클릭하여 시각화',
      latitude: '위도',
      longitude: '경도',
      radius: '반경',
      labeledFeatures: '레이블된 피처',
      mapView: '지도 보기 (읽기 전용)',
      refreshMap: '지도 새로고침',
      viewFile: '파일 보기',
      loadingMap: '지도 로딩 중...',
    },
  },

  // OCR Page
  ocr: {
    title: '문서 OCR',
    subtitle: '고급 OCR 기술을 사용하여 이미지에서 텍스트 추출',
    uploadTitle: '이미지 업로드',
    dragDrop: '여기에 이미지를 드래그 앤 드롭하세요',
    orClick: '또는 클릭하여 찾아보기',
    selectImage: '이미지 선택',
    supportedFormats: '지원 형식: JPG, PNG, BMP, TIFF',
    removeImage: '이미지 제거',
    
    options: {
      title: 'OCR 옵션',
      preprocessing: '전처리',
      preprocessingDesc: '회전 및 기울기 보정 적용',
      engineTitle: 'OCR 엔진',
      surya: 'Surya OCR',
      suryaDesc: '전체 레이아웃 + 표 + 텍스트 (모든 언어)',
      paddle: 'PaddleOCR',
      paddleDesc: '텍스트 인식 (한국어 + 라틴어만)',
      hybrid: '하이브리드 모드',
      hybridDesc: 'Surya 레이아웃 + PaddleOCR 텍스트',
      recommended: '권장',
    },
    
    process: '이미지 처리',
    
    results: {
      success: 'OCR이 성공적으로 완료되었습니다',
      foundLines: '{count}개의 텍스트 라인 발견',
      failed: 'OCR 실패',
      preprocessedImage: '전처리된 이미지',
      rotationApplied: '적용된 회전: {degrees}°',
      extractedText: '추출된 텍스트',
      noTextDetected: '텍스트가 감지되지 않았습니다',
      jsonResults: 'JSON 결과',
      downloadTxt: 'TXT 다운로드',
      downloadJson: 'JSON 다운로드',
      placeholder: '이미지를 업로드하고 "이미지 처리"를 클릭하여 결과를 확인하세요',
      processingMessage: '이미지 처리 중...',
      processingNote: '이미지 크기에 따라 몇 분 정도 소요될 수 있습니다',
    },
  },

  // CAD Page
  cad: {
    title: 'AutoCAD 분석기',
    subtitle: '자동 기하학 추출 및 BCR/FAR 계산',
    resetAnalysis: '분석 초기화',
    
    upload: {
      title: 'DXF 파일 업로드',
      dragDrop: '여기에 DXF 파일을 드래그 앤 드롭하세요',
      orClick: '또는 클릭하여 찾아보기',
      selectFile: 'DXF 파일 선택',
      supportedFormats: '지원: .dxf 파일만',
    },
    
    layers: {
      title: '레이어 선택',
      selectAll: '전체 선택',
      deselectAll: '전체 해제',
      selected: '{count}개 레이어 선택됨',
      processButton: '파일 처리',
    },
    
    tools: {
      title: '선택 도구',
      siteSelection: '대지 선택',
      buildingFootprint: '건물 면적',
      floorCount: '층수',
      floors: '층',
    },
    
    metrics: {
      siteArea: '대지 면적',
      buildingFootprint: '건축 면적',
      totalFloorArea: '총 바닥 면적',
      bcr: '건폐율',
      far: '용적률',
      bcrFull: '건폐율',
      farFull: '용적률',
    },
    
    viewer: {
      noData: 'CAD 데이터가 로드되지 않았습니다',
      clickToSelect: '폴리곤을 클릭하여 선택하세요',
    },
  },

  // Map Page
  map: {
    title: '인프라 탐색기',
    subtitle: 'OpenStreetMap을 사용한 인프라 데이터 탐색',
    
    search: {
      placeholder: '위치 검색 또는 좌표 입력 (위도, 경도)',
      button: '검색',
      notFound: '위치를 찾을 수 없습니다',
    },
    
    radius: '반경',
    meters: '미터',
    
    fetch: {
      button: '인프라 데이터 가져오기',
      loading: '로딩 중...',
      success: '{count}개의 인프라 기능을 성공적으로 로드했습니다.',
    },
    
    building: {
      types: '건물 유형',
      hospital: '병원',
      school: '학교',
      residential: '주거용 건물',
      river: '강',
      lake: '호수',
      office: '사무실',
      others: '기타',
    },
    
    labels: {
      selectType: '유형 선택',
      customType: '사용자 정의 유형',
      customTypePlaceholder: '사용자 정의 유형 입력...',
      saveSelection: '선택 저장',
      selectedFeatures: '선택된 기능',
      noFeatures: '선택된 기능 없음',
      submitFeatures: '선택된 기능 제출',
    },
    
    ai: {
      title: 'AI 건물 감지',
      description: 'AI를 사용하여 건물을 자동으로 감지하고 분류',
      analyze: 'AI로 분석',
    },
  },

  // Chatbot Page
  chatbot: {
    title: '건축 규정 도우미',
    subtitle: '건축 규정 및 건설 표준에 대해 질문하세요',
    
    searchMode: {
      title: '검색 모드',
      current: '현재',
      auto: '자동',
      autoDesc: '스마트 검색 (유사성 검색 후 LLM)',
      similarity: '유사성',
      similarityDesc: '벡터 기반 의미 검색',
      llmGenerated: 'LLM 쿼리',
      llmGeneratedDesc: 'AI 생성 데이터베이스 쿼리',
    },
    
    searchMethods: {
      similarity: '🔍 유사성',
      llmGenerated: '🤖 LLM 쿼리',
      directMatch: '📊 직접 매칭',
      fulltext: '🔎 전문 검색',
    },
    
    input: {
      placeholder: '규정, 표준 또는 특정 조항에 대해 질문하세요...',
      send: '보내기',
      clear: '지우기',
      hint: 'Enter를 눌러 전송, Shift+Enter로 줄바꿈',
    },
    
    messages: {
      sources: '출처',
      suggestedQuestions: '추천 질문',
      error: '죄송합니다. 오류가 발생했습니다. 다시 시도해 주세요.',
    },
  },

  // Demo Page
  demo: {
    title: '완전한 데모 워크플로우',
    subtitle: '전체 시스템 체험: 문서 OCR → CAD 분석 → 인프라 매핑',
    
    steps: {
      ocr: 'OCR',
      cad: 'CAD',
      infrastructure: '인프라',
      complete: '완료',
    },
    
    session: {
      userId: '사용자 ID',
      sessionId: '세션 ID',
      initError: '데모 세션 초기화 실패',
    },
    
    ocr: {
      title: '문서 업로드',
      dragDrop: '여기에 파일을 드래그 앤 드롭하세요',
      orClick: '또는 클릭하여 찾아보기',
      selectFiles: '파일 선택',
      supportedFormats: '지원: PDF, DOC, DOCX, JPG, PNG',
      filesSelected: '{count}개 파일 선택됨',
      clearAll: '모두 지우기',
      options: 'OCR 옵션',
      preprocessing: '전처리',
      preprocessingDesc: '회전 및 기울기 보정 적용',
      engineTitle: 'OCR 엔진',
      surya: 'Surya OCR',
      suryaDesc: '전체 레이아웃 + 표 + 텍스트 (모든 언어)',
      paddle: 'PaddleOCR',
      paddleDesc: '텍스트 인식 (한국어 + 라틴어만)',
      hybrid: '하이브리드 모드',
      hybridDesc: 'Surya 레이아웃 + PaddleOCR 텍스트',
      recommended: '권장',
      processDocuments: '문서 처리',
      processingDocuments: '{count}개 문서 처리 중...',
      completed: 'OCR이 성공적으로 완료되었습니다',
      processedCount: '{count}개 문서 처리됨',
      document: '문서',
      originalImage: '원본 이미지',
      preprocessedImage: '전처리된 이미지',
      rotationApplied: '적용된 회전: {degrees}°',
      extractedText: '추출된 텍스트',
      noTextDetected: '텍스트가 감지되지 않았습니다',
      foundLines: '{count}개의 텍스트 라인 발견',
      jsonResults: 'JSON 결과',
      downloadTxt: 'TXT 다운로드',
      downloadJson: 'JSON 다운로드',
      ocrFailed: 'OCR 실패',
      uploadToSee: '결과를 보려면 문서를 업로드하세요',
    },
    
    cad: {
      title: 'CAD 분석',
      uploadTitle: '프로젝트 파일 업로드',
      dragDrop: 'DXF 파일 드래그 앤 드롭',
      supportedFormats: '지원 형식: .dxf',
      browseFiles: '파일 찾아보기',
      scanningGeometry: 'DXF 기하학 스캔 중...',
      
      parserMode: {
        title: '파서 모드',
        manual: '수동',
        manualDesc: '레이어를 수동으로 선택하고 폴리곤 라벨링',
        python: 'Python 파서',
        pythonDesc: '레이어 명명 규칙을 통한 자동 감지',
        llm: 'AI 파서',
        llmDesc: 'GPT 기반 지능형 레이어 감지',
        recommended: '권장',
      },
      
      layers: {
        title: '레이어 선택',
        selectAll: '전체 선택',
        deselectAll: '전체 해제',
        selected: '{count}개 레이어 선택됨',
        processFile: '파일 처리',
        activeLayers: '활성 레이어',
        updateGeometry: '기하학 업데이트',
      },
      
      tools: {
        mode: '모드',
        siteArea: '대지 면적',
        building: '건물',
        floors: '층수',
        type: '유형',
        footprint: '건축면적',
        upperFloor: '상층부',
      },
      
      metrics: {
        siteArea: '대지 면적',
        building: '건물',
        totalFloor: '총 바닥',
        bcr: '건폐율',
        far: '용적률',
        autoCalculated: '자동 계산됨',
        aiCalculated: 'AI 계산됨',
      },
      
      standardization: {
        title: 'CAD 문서 표준화 요구사항',
        warning: 'Python 파서가 기하학과 단위를 올바르게 해석하려면 DWG/DXF 파일이 다음 표준을 따라야 합니다.',
        globalSettings: '전역 설정',
        drawingUnits: '도면 단위',
        millimeters: '밀리미터 (mm)',
        systemVariable: '시스템 변수',
        geometryType: '기하학 유형',
        closedPolylines: '모든 면적은 닫힌 폴리라인(LWPOLYLINE)을 사용하여 그려야 합니다',
        prohibitedNames: '금지된 레이어 이름',
        prohibitedNamesDesc: '단일 숫자(1, 2, 3...8)를 레이어 이름으로 사용하지 마세요',
        layerNaming: '필수 레이어 명명 규칙',
        siteBoundary: '대지 경계',
        siteBoundaryKr: '대지경계',
        requiredKeywords: '필수 키워드',
        recommendedLayer: '권장',
        buildingFootprint: '건축 면적',
        buildingFootprintKr: '건축면적',
        floorAreaLayers: '층별 면적 레이어',
        floorAreaLayersKr: '층별면적',
        namingPattern: '명명 패턴',
        allowedSuffixes: '허용된 접미사',
        materialSpecs: '재료 사양',
        materialSpecsKr: '재료명세',
        textKeywords: '텍스트 키워드',
        quickReference: '빠른 참조',
        element: '요소',
        standardLayer: '표준 레이어',
        triggerKeyword: '트리거 키워드',
        checklistTitle: '다음 사항을 확인했는지 확인하세요:',
        checkUnits: 'DXF 파일이 밀리미터(mm)를 도면 단위로 사용합니다 (INSUNITS = 4)',
        checkPolylines: '모든 면적이 닫힌 폴리라인(LWPOLYLINE)을 사용하여 그려졌습니다',
        checkSite: '대지 경계 레이어에 키워드가 포함되어 있습니다: SITE, BOUNDARY, LND, 대지, 또는 지적',
        checkFootprint: '건축 면적 레이어에 키워드가 포함되어 있습니다: FOOTPRINT, HH, 또는 건축면적',
        checkFloors: '층 레이어가 명명 패턴을 따릅니다: 1F, 2F, B1F (또는 FLR/FLOOR/층과 유사)',
        allChecked: '모든 요구사항 확인됨',
        pleaseCheckAll: '계속하려면 모든 항목을 확인하세요',
        understand: '이해했습니다 & 계속',
      },
    },
    
    infrastructure: {
      title: '인프라 매핑',
      searchLocation: '위치 검색',
      searchPlaceholder: '자카르타, 인도네시아 또는 -6.358, 106.835',
      searchRadius: '검색 반경',
      fetchData: '데이터 가져오기',
      loading: '로딩 중',
      successLoaded: '{count}개의 인프라 기능을 성공적으로 로드했습니다.',
      noFeaturesFound: '이 지역에서 인프라 기능을 찾을 수 없습니다. 검색 반경을 늘리거나 다른 위치를 검색해 보세요.',
      
      buildingTypes: {
        title: '건물 유형',
        hospital: '병원',
        school: '학교',
        residential: '주거용 건물',
        river: '강',
        lake: '호수',
        office: '사무실',
        others: '기타',
      },
      
      legend: {
        water: '수역',
        roads: '도로',
        buildings: '건물',
        railways: '철도',
      },
      
      modal: {
        assignType: '건물 유형 지정',
        changeType: '건물 유형 변경',
        selectTypePrompt: '이 기능을 분류할 유형을 선택하세요',
        changeTypePrompt: '다른 유형을 클릭하여 분류를 변경하세요',
        selectType: '유형 선택',
        customTypeName: '사용자 정의 유형 이름',
        customTypePlaceholder: '사용자 정의 유형 이름 입력...',
        preview: '미리보기',
        updateType: '유형 업데이트',
        assignTypeBtn: '유형 지정',
      },
      
      submission: {
        confirmTitle: '제출 확인',
        confirmMessage: '{count}개의 라벨된 기능을 제출하시겠습니까?',
        labeledFeatures: '라벨된 기능',
        submitting: '제출 중...',
        yesSubmit: '예, 제출',
        submitBtn: '라벨된 기능 제출',
        classified: '{count}개 건물 분류됨',
        savedSuccess: '인프라 데이터가 성공적으로 저장되었습니다!',
        saveWarning: '경고: 인프라 데이터가 제대로 저장되지 않았을 수 있습니다',
        saveFailed: '인프라 데이터 제출 실패',
      },
    },
    
    complete: {
      title: '데모 완료!',
      message: '모든 워크플로우 단계가 성공적으로 완료되었습니다. 데이터가 사용자 ID로 저장되었습니다:',
      summary: '요약',
      ocrProcessing: 'OCR 처리',
      ocrResult: '{total}개 문서 중 {success}개가 성공적으로 처리되었습니다',
      cadAnalysis: 'CAD 분석',
      cadResult: 'CAD 기하학이 성공적으로 처리 및 분석되었습니다',
      infraMapping: '인프라 매핑',
      infraResult: '인프라 기능이 라벨링되고 분석되었습니다',
      startNew: '새 데모 시작',
    },
    
    navigation: {
      skipStep: '이 단계 건너뛰기',
      continueToCAD: 'CAD 분석으로 계속 →',
      continueToInfra: '인프라로 계속 →',
      backToHome: '홈으로 돌아가기',
    },
  },

  // Language Switcher
  language: {
    title: '언어',
    english: 'English',
    korean: '한국어',
  },
};
