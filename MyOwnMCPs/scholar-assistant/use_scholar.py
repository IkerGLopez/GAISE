from server import search_scholar
import sys

def run_queries():
    queries = [
        "assessment challenges in project-based learning",
    ]

    with open("scholar_results.txt", "w", encoding="utf-8") as f:
        f.write("--- STARTING SCHOLAR SEARCH ---\n")
        print("Starting search...")
        for q in queries:
            f.write(f"\nQuerying: {q}\n")
            try:
                if hasattr(search_scholar, 'fn'):
                     results = search_scholar.fn(q, limit=3)
                else:
                     results = search_scholar(q, limit=3)
                f.write(str(results))
                f.write("\n")
            except Exception as e:
                f.write(f"Error: {e}\n")
        f.write("\n--- END SEARCH ---\n")

if __name__ == "__main__":
    run_queries()
