# Scholar Assistant MCP 🎓

An MCP server that allows agents to search Google Scholar to retrieve improved bibliographic references and citations for academic writing.

## 🛠 Features

- **Scholar Search**: Takes a natural language query (e.g., "agents in supply chain management") and retrieves real bibliographic data.
- **Customizable Limits**: Fetch the top X results to get the most relevant papers.
- **Rich Output**: Returns Title, Authors, Year, Venue, and Link for each result.

## 🚀 Quick start

1. Create a Python environment (recommended):

```bash
python -m venv .venv
.\.venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```
(Requires `fastmcp` and `scholarly`)

3. Run the MCP server:

```bash
python server.py
```

The server uses FastMCP and runs as a stdio MCP server — connect with your favorite MCP client or IDE integration that supports MCP.

## 🧩 Usage Example

This tool is designed to be used by an AI agent assisting with academic writing.

**Tool:** `search_scholar`

**Parameters:**
- `query` (string): "large language models for code generation"
- `limit` (integer): 3

**Sample Output:**
```text
**Title**: Large language models of code and programming
**Authors**: Z Feng, D Guo, D Tang, N Duan, X Feng...
**Year**: 2020
**Venue**: arXiv preprint arXiv...
**Link**: https://arxiv.org/abs/2007.14601

---

**Title**: ...
```

## ⚠️ Limitations

- **Rate Limiting**: Google Scholar aggressively rate-limits automated requests. If you make too many requests quickly, you may be blocked or encounter CAPTCHAs. The `scholarly` library attempts to handle this, but it is not foolproof.
- **Performance**: Queries can be slow as they involve web scraping.
