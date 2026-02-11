from fastmcp import FastMCP
from scholarly import scholarly

mcp = FastMCP("ScholarAssistant")

@mcp.tool()
def search_scholar(query: str, limit: int = 5) -> str:
    """
    Search Google Scholar for a natural language query and return bibliographic references.
    
    Args:
        query: The search query string.
        limit: The maximum number of results to return (default 5).
    """
    try:
        # returns a generator
        search_query = scholarly.search_pubs(query)
        results = []
        
        count = 0
        for pub in search_query:
            if count >= limit:
                break
            
            # Extract relevant info safely
            bib = pub.get('bib', {})
            title = bib.get('title', 'Unknown Title')
            
            # Authors can be a list or string
            authors = bib.get('author', ['Unknown Author'])
            if isinstance(authors, list):
                authors = ', '.join(authors)
            
            pub_year = bib.get('pub_year', 'n.d.')
            venue = bib.get('venue', '') # Journal or conference
            pub_url = pub.get('pub_url', 'No URL')
            
            # Construct a formatted string
            citation = (
                f"**Title**: {title}\n"
                f"**Authors**: {authors}\n"
                f"**Year**: {pub_year}\n"
                f"**Venue**: {venue}\n"
                f"**Link**: {pub_url}"
            )
            
            results.append(citation)
            count += 1
            
        if not results:
            return "No results found."
            
        return "\n\n---\n\n".join(results)

    except Exception as e:
        return f"Error searching Google Scholar: {str(e)}"

if __name__ == "__main__":
    mcp.run()
