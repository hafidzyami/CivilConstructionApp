# PDF/DOCX Regulation Extractor

Python-based tool to extract building regulation articles from PDF and DOCX files and output to JSON format.

## Features

- Extracts articles from PDF files using `pdfplumber`
- Extracts articles from DOCX files using `python-docx`
- Automatically separates base articles and sub-articles
- Detects article numbering patterns:
  - Base articles: Article 5, Article 27, 제5조
  - Sub-articles: Article 5-1, Article 27-2, 제5조의2
  - Nested sub-articles: Article 5-1-1
- Extracts numeric values, units, and operators
- Auto-detects topics (building_coverage_ratio, floor_area_ratio, etc.)
- Outputs to clean JSON format

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Usage

Run the extraction script:
```bash
python extract_regulations.py
```

This will:
1. Extract text from `backend/data/regulations/building-act-sample.docx`
2. Extract text from `backend/data/regulations/enforcement-decree.pdf`
3. Parse articles and sub-articles
4. Save output to `output/national-regulation.json` and `output/regional-regulation.json`

## Output Format

```json
{
  "name": "Building Act",
  "level": "National",
  "authority": "Ministry of Land, Infrastructure and Transport",
  "articles": [
    {
      "id": "article_27",
      "title": "Standards for Building-to-Land Ratio",
      "text": "The building coverage ratio shall not exceed 60 percent...",
      "topic": "building_coverage_ratio",
      "value": 60,
      "unit": "percent",
      "operator": "<="
    }
  ],
  "subArticles": [
    {
      "id": "article_27-2",
      "title": "Exceptions",
      "text": "In special cases...",
      "level": 1,
      "parentId": "article_27"
    }
  ],
  "zones": []
}
```

## Manual Review

After extraction:
1. Review the generated JSON files in `output/` folder
2. Check if all articles were extracted correctly
3. Manually add any missing articles
4. Add zone information if needed
5. Copy the final JSON files to `backend/data/regulations/`

## Supported Patterns

### Article Headers
- English: `Article 5:`, `Article 27:`
- Korean: `제5조`, `제27조`
- Sub-articles: `Article 5-1`, `Article 27-2`, `제5조의2`
- Nested: `Article 5-1-1`

### Value Extraction
- Percentages: `60%`, `60 percent`
- Area: `500 m²`, `500 square meters`
- Height: `20m`, `20 meters`

### Operators
- `<=` : "less than or equal to", "not exceed", "이하"
- `>=` : "greater than or equal to", "at least", "이상"
- `<` : "less than", "미만"
- `>` : "greater than", "초과"
