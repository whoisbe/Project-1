
import os
import sys
import cmd
import shlex
import json
from typing import Optional, List
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich import box
import typesense
from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.document import Document
from prompt_toolkit.formatted_text import HTML
import sqlglot
from sqlglot import exp

# Load environment variables
load_dotenv()

# Initialize Rich Console
console = Console()

class SQLCompleter(Completer):
    def __init__(self, tables: List[str], columns: dict):
        self.tables = tables
        self.columns = columns # dict mapping table -> list of columns
        self.keywords = [
            'SELECT', 'FROM', 'WHERE', 'ORDER BY', 'LIMIT', 'OFFSET',
            'AND', 'OR', 'NOT', 'IN', 'LIKE', 'NULL', 'DESC', 'ASC'
        ]
        self.meta_commands = [r'\l', r'\c', r'\d', r'\s', r'\?', r'\q', r'\i']

    def get_completions(self, document: Document, complete_event):
        text_before_cursor = document.text_before_cursor
        word_before_cursor = document.get_word_before_cursor(WORD=True)
        
        # Check if we are typing a meta command
        if text_before_cursor.strip().startswith('\\'):
             for cmd in self.meta_commands:
                 if cmd.startswith(word_before_cursor):
                     yield Completion(cmd, start_position=-len(word_before_cursor))
             return

        # Simple SQL Completion
        
        # 1. Keywords (always available)
        for keyword in self.keywords:
            if keyword.lower().startswith(word_before_cursor.lower()):
                yield Completion(keyword, start_position=-len(word_before_cursor), display_meta='Keyword')

        # 2. Tables (Collections)
        # Suggest tables if last keyword was FROM or usually at start of queries context
        # For simplicity, we just add them to completions
        for table in self.tables:
             if table.startswith(word_before_cursor):
                 yield Completion(table, start_position=-len(word_before_cursor), display_meta='Collection')

        # 3. Columns (Fields)
        # Attempt to find the table context. 
        # Very basic check: "FROM table_name"
        found_table = None
        lower_text = text_before_cursor.lower()
        
        # Look for the last "from" word
        import re
        match = re.search(r'from\s+(\w+)', lower_text)
        if match:
            found_table = match.group(1)
            # Try to match case from our known tables
            for t in self.tables:
                if t.lower() == found_table:
                    found_table = t
                    break
        
        # If we have a connected collection, fallback to that if no FROM clause yet
        if not found_table and hasattr(self, 'current_collection'):
             # This part requires access to the app state, passing it in would be cleaner, 
             # but we can rely on passed columns if we merge all available columns or just generic approach.
             # For now, let's just complete columns if we can.
             pass

        # Add all columns from all tables for now (simplification)
        # Or context-aware if we parsed. 
        for table_name, cols in self.columns.items():
             for col in cols:
                 if col.startswith(word_before_cursor):
                     # Add table info to display
                     yield Completion(col, start_position=-len(word_before_cursor), display_meta=f'Field ({table_name})')

class TypesenseCLI:
    def __init__(self):
        self.api_key = os.getenv("TYPESENSE_API_KEY")
        self.host = os.getenv("TYPESENSE_HOST", "localhost")
        self.port = os.getenv("TYPESENSE_PORT", "8108")
        self.protocol = os.getenv("TYPESENSE_PROTOCOL", "http")
        
        if not self.api_key:
            console.print("[bold red]Error:[/bold red] TYPESENSE_API_KEY not found in .env file.")
            sys.exit(1)

        try:
            self.client = typesense.Client({
                'nodes': [{
                    'host': self.host,
                    'port': self.port,
                    'protocol': self.protocol
                }],
                'api_key': self.api_key,
                'connection_timeout_seconds': 2
            })
            # Verify connection
            self.client.collections.retrieve()
            console.print(f"[bold green]Connected to Typesense at {self.host}:{self.port}[/bold green]")
        except Exception as e:
            console.print(f"[bold red]Connection failed:[/bold red] {e}")
            sys.exit(1)

        self.current_collection = None
        
        # Metadata for autocomplete
        self.available_collections = []
        self.collection_fields = {} # Map collection -> list of fields
        self.refresh_metadata()

        self.completer = SQLCompleter(self.available_collections, self.collection_fields)
        self.session = PromptSession(
            history=FileHistory('.tscli_history'),
            completer=self.completer
        )

    def refresh_metadata(self):
        """Fetch collections and fields for autocomplete."""
        try:
            cols = self.client.collections.retrieve()
            self.available_collections = [c['name'] for c in cols]
            self.collection_fields = {}
            for c in cols:
                self.collection_fields[c['name']] = [f['name'] for f in c.get('fields', [])]
            
            # Update completer if it exists
            if hasattr(self, 'completer'):
                self.completer.tables = self.available_collections
                self.completer.columns = self.collection_fields
                
        except Exception:
            pass # Silent fail during init

    def get_prompt(self):
        if self.current_collection:
            return HTML(f'<ansigreen>tscli</ansigreen> (<ansiyellow>{self.current_collection}</ansiyellow>)> ')
        return HTML('<ansigreen>tscli</ansigreen>> ')

    def do_list(self):
        """List all available collections."""
        try:
            collections = self.client.collections.retrieve()
            table = Table(title="Available Collections", box=box.ROUNDED)
            table.add_column("Name", style="cyan")
            table.add_column("Num Documents", style="magenta")
            table.add_column("Created At", style="green")

            for col in collections:
                table.add_row(
                    col.get('name', 'N/A'),
                    str(col.get('num_documents', 'N/A')),
                    str(col.get('created_at', 'N/A')) # Timestamp usually
                )
            console.print(table)
        except Exception as e:
            console.print(f"[bold red]Error listing collections:[/bold red] {e}")

    def do_connect(self, collection_name):
        """Connect to a specified collection."""
        if not collection_name:
            console.print(r"[yellow]Usage: \c [collection][/yellow]")
            return

        try:
            # check if collection exists
            self.client.collections[collection_name].retrieve()
            self.current_collection = collection_name
            console.print(f"You are now connected to collection [bold cyan]{collection_name}[/bold cyan].")
        except Exception:
             console.print(f"[bold red]Collection '{collection_name}' does not exist.[/bold red]")

    def do_describe(self, collection_name=None):
        """Describe a collection."""
        target_col = collection_name if collection_name else self.current_collection
        
        if not target_col:
            console.print(r"[yellow]No collection selected. usage: \d [collection] or connect to one first.[/yellow]")
            return

        try:
            info = self.client.collections[target_col].retrieve()
            
            # Fields Table
            table = Table(title=f"Collection: {target_col}", box=box.ROUNDED)
            table.add_column("Field Name", style="cyan")
            table.add_column("Type", style="magenta")
            table.add_column("Facet?", style="green")
            table.add_column("Optional?", style="yellow")
            table.add_column("Index?", style="blue")

            for field in info.get('fields', []):
                table.add_row(
                    field.get('name', ''),
                    field.get('type', ''),
                    str(field.get('facet', False)),
                    str(field.get('optional', False)),
                    str(field.get('index', True))
                )
            console.print(table)
            
            # Extra info
            console.print(f"[dim]Default Sorting Field: {info.get('default_sorting_field', 'None')}[/dim]")
            
        except Exception as e:
            console.print(f"[bold red]Error describing collection '{target_col}':[/bold red] {e}")

    def do_stats(self, collection_name=None):
        """Show field statistics for a collection."""
        target_col = collection_name if collection_name else self.current_collection
        
        if not target_col:
            console.print(r"[yellow]No collection selected. usage: \stats [collection] or connect to one first.[/yellow]")
            return

        try:
            # Get collection info for schema and total documents
            info = self.client.collections[target_col].retrieve()
            total_docs = info.get('num_documents', 0)
            
            if total_docs == 0:
                console.print(f"[yellow]Collection '{target_col}' is empty.[/yellow]")
                return

            table = Table(title=f"Field Statistics: {target_col} (Total Docs: {total_docs})", box=box.ROUNDED)
            table.add_column("Field Name", style="cyan")
            table.add_column("Count", style="magenta")
            table.add_column("Percentage", style="green")

            with console.status(f"[bold green]Calculating statistics for {target_col}...[/bold green]"):
                for field in info.get('fields', []):
                    field_name = field.get('name', '')
                    is_optional = field.get('optional', False)
                    is_indexed = field.get('index', True)
                    
                    count = 0
                    if not is_optional:
                        # Non-optional fields are present in all documents
                        count = total_docs
                    elif not is_indexed:
                        count = "N/A (Not Indexed)"
                    else:
                        try:
                            # Attempt 1: Standard existence check
                            search_results = self.client.collections[target_col].documents.search({
                                'q': '*',
                                'filter_by': f'{field_name}:!=null',
                                'per_page': 0
                            })
                            count = search_results.get('found', 0)
                        except Exception as e:
                             # Fallback for numeric fields if !=null fails (common in some TS versions or configs)
                            if field.get('type') in ['int32', 'int64', 'float']:
                                try:
                                    # Try range query covering most values
                                    search_results = self.client.collections[target_col].documents.search({
                                        'q': '*',
                                        'filter_by': f'{field_name}:>= -2000000000', # Covers most standard usage
                                        'per_page': 0
                                    })
                                    count = search_results.get('found', 0)
                                except Exception:
                                     count = f"Err: {str(e)[:20]}"
                            else:
                                count = f"Err: {str(e)[:20]}"

                    percentage = "N/A"
                    if isinstance(count, int):
                        pct_val = (count / total_docs) * 100
                        percentage = f"{pct_val:.1f}%"
                        count_str = str(count)
                    else:
                        count_str = str(count)

                    table.add_row(field_name, count_str, percentage)

            console.print(table)
            
        except Exception as e:
            console.print(f"[bold red]Error getting stats for '{target_col}':[/bold red] {e}")

    def do_help(self):
        """Display help information."""
        table = Table(title="Meta Commands", box=box.ROUNDED)
        table.add_column("Command", style="cyan")
        table.add_column("Description", style="white")

        table.add_row(r"\l", "List all available collections.")
        table.add_row(r"\c [collection]", "Connect to a specified collection.")
        table.add_row(r"\d [collection]", "Describe a collection.")
        table.add_row(r"\s [collection]", "Show field statistics (population).")
        table.add_row(r"\?", "Display help information.")
        table.add_row(r"\q", "Quit the shell.")
        table.add_row(r"\i [file]", "Execute commands from a JSON script file.")
        table.add_row("SELECT ...", "Run SQL query on collection.")
        
        console.print(table)

    def execute_sql(self, sql_query):
        """Translate SQL to Typesense query and execute."""
        try:
            parsed = sqlglot.parse_one(sql_query)
        except Exception as e:
             console.print(f"[bold red]SQL Parse Error:[/bold red] {e}")
             return

        if not isinstance(parsed, exp.Select):
             console.print("[yellow]Only SELECT statements are supported.[/yellow]")
             return

        # 1. Determine Collection (FROM table)
        collection_name = self.current_collection
        from_expressions = parsed.find_all(exp.Table)
        for table in from_expressions:
            collection_name = table.name
            break # Only support single table for now
            
        if not collection_name:
             console.print("[bold red]Error:[/bold red] No collection specified. Use FROM [collection] or connect using \c.")
             return

        # 2. Select Fields (SELECT ...)
        include_fields = []
        is_star = False
        for expression in parsed.expressions:
            if isinstance(expression, exp.Star):
                is_star = True
                break
            # Handle standard identifiers
            if isinstance(expression, exp.Column):
                 include_fields.append(expression.name)
            # Handle Alias? Not supported in TS directly but we collect names
            
        query_params = {
            'q': '*',
            'per_page': 10,
            'page': 1
        }
        
        if not is_star and include_fields:
            query_params['include_fields'] = ",".join(include_fields)

        # 3. WHERE Clause -> filter_by
        # This is the tricky part. Need to translate SQL expression to TS filter string.
        # Simple recursion for basic operators.
        where = parsed.find(exp.Where)
        if where:
            try:
                ts_filter = self._transpile_where(where.this)
                if ts_filter:
                    query_params['filter_by'] = ts_filter
            except ValueError as ve:
                 console.print(f"[bold red]Translation Error:[/bold red] {ve}")
                 return

        # 4. ORDER BY
        order = parsed.find(exp.Order)
        if order:
            sort_parts = []
            for ordered in order.expressions:
                field = ordered.this.name
                direction = "desc" if ordered.args.get('desc') else "asc"
                sort_parts.append(f"{field}:{direction}")
            if sort_parts:
                query_params['sort_by'] = ",".join(sort_parts)

        # 5. LIMIT
        limit = parsed.find(exp.Limit)
        if limit:
            try:
                query_params['per_page'] = int(limit.expression.this)
            except:
                pass
        
        
        # Execute Query
        try:
            console.print(f"[dim]Executing against '{collection_name}': {query_params}[/dim]")
            results = self.client.collections[collection_name].documents.search(query_params)
            
            hits = results.get('hits', [])
            if not hits:
                console.print("[yellow]No results found.[/yellow]")
                return

            # Dynamic Table
            # Determine columns to show
            if not hits:
                 return
                 
            # If explicit fields requested, use them. Else use all from first hit.
            first_doc = hits[0]['document']
            columns_to_show = include_fields if (include_fields and not is_star) else list(first_doc.keys())
            
            table = Table(box=box.ROUNDED)
            for col in columns_to_show:
                table.add_column(col, style="cyan")
                
            for hit in hits:
                doc = hit['document']
                row = [str(doc.get(col, '')) for col in columns_to_show]
                table.add_row(*row)
                
            console.print(table)
            console.print(f"[dim]Found {results.get('found', 0)} hits in {results.get('search_time_ms', 0)}ms[/dim]")
            
        except Exception as e:
            # Automatic fallback for IS NOT NULL on numeric fields if "Not an int32" error occurs
            msg = str(e)
            if "Not an int32" in msg and "!=null" in query_params.get('filter_by', ''):
                 # Try replacing mismatching !=null with broad range
                 console.print("[yellow]Numeric field detected, retrying with range query...[/yellow]")
                 # We need to find which field caused it, or just blindly replace ALL :!=null with range?
                 # Safer: simple regex replace field:!=null -> field:>= -2000000000
                 import re
                 # This regex finds `field:!=null` and replaces with range
                 new_filter = re.sub(r'([\w_]+):!=null', r'\1:>= -2000000000', query_params['filter_by'])
                 query_params['filter_by'] = new_filter
                 try:
                     self.execute_sql_params(collection_name, query_params, include_fields, is_star)
                     return
                 except Exception as e2:
                     console.print(f"[bold red]Retry Failed:[/bold red] {e2}")
                     return

            if "invalid comparator" in msg and ":=null" in query_params.get('filter_by', ''):
                 console.print("[yellow]Note: Typesense does not support explicit NULL checks (IS NULL) on numeric fields in filter_by.[/yellow]")
                 return

            console.print(f"[bold red]Query Error:[/bold red] {msg}")

    def execute_sql_params(self, collection_name, query_params, include_fields, is_star):
        """Helper to re-run execution logic"""
        console.print(f"[dim]Executing against '{collection_name}': {query_params}[/dim]")
        results = self.client.collections[collection_name].documents.search(query_params)
        
        hits = results.get('hits', [])
        if not hits:
            console.print("[yellow]No results found.[/yellow]")
            return

        if not hits: return

        first_doc = hits[0]['document']
        columns_to_show = include_fields if (include_fields and not is_star) else list(first_doc.keys())
        
        table = Table(box=box.ROUNDED)
        for col in columns_to_show:
            table.add_column(col, style="cyan")
            
        for hit in hits:
            doc = hit['document']
            row = [str(doc.get(col, '')) for col in columns_to_show]
            table.add_row(*row)
            
        console.print(table)
        console.print(f"[dim]Found {results.get('found', 0)} hits in {results.get('search_time_ms', 0)}ms[/dim]")

    def _transpile_where(self, node):
        """Recursively translate SQLGlot expression to Typesense filter_by string."""
        
        # Handle binary operations: EQ, GT, LT, etc.
        # Typesense: field:value, field:>value, field:[v1..v2]
        
        if isinstance(node, exp.And):
            return f"{self._transpile_where(node.left)} && {self._transpile_where(node.right)}"
        
        if isinstance(node, exp.Or):
            return f"{self._transpile_where(node.left)} || {self._transpile_where(node.right)}"
        
        # Comparison Operators
        # node.this is usually column, node.expression is value
        if isinstance(node, exp.EQ):
            return f"{node.left.name}:={node.right.name}" # Using := for exact match in TS
        if isinstance(node, exp.GT):
            return f"{node.left.name}:>{node.right.name}"
        if isinstance(node, exp.LT):
            return f"{node.left.name}:<{node.right.name}"
        if isinstance(node, exp.GTE):
            return f"{node.left.name}:>={node.right.name}"
        if isinstance(node, exp.LTE):
            return f"{node.left.name}:<={node.right.name}"
        if isinstance(node, exp.NEQ):
            return f"{node.left.name}:!={node.right.name}"
            
        if isinstance(node, exp.Like):
            # rudimentary LIKE support
            # LIKE 'term' -> field:term (text match)
            # LIKE '%term%' -> unsupported direct mapping in filter_by, usually 'q' param, 
            # but here we are in filter_by context. 
            # Typesense filter_by supports field:value for exact or string match.
            return f"{node.this.name}:{node.expression.this}"

        if isinstance(node, exp.Is):
            # Handle IS NULL / IS NOT NULL
            # node.this is the field
            # node.expression is Null()
            if isinstance(node.expression, exp.Null):
                # Standard SQLGlot IS parser often keeps the NOT in parent structure or as a flag?
                # Actually, sqlglot parses "x IS NOT NULL" as Not(Is(x, Null)).
                # So we might encounter Is(x, Null) here.
                return f"{node.this.name}:=null"
        
        if isinstance(node, exp.Not):
            # Handle NOT (...)
            # Specifically check for IS NULL inside NOT -> IS NOT NULL
            if isinstance(node.this, exp.Is) and isinstance(node.this.expression, exp.Null):
                 return f"{node.this.this.name}:!=null"
            # Generic NOT mapping if possible, though TS uses negation differently often
            # return f"!({self._transpile_where(node.this)})" 
            # TS doesn't strictly have !(expression) syntax in filter_by, usually operators.
            # But let's try the IS NOT NULL case specifically as requested.
            
        raise ValueError(f"Unsupported WHERE clause operator: {type(node)}")

    def execute_file(self, filename):
        """Execute commands from a JSON file."""
        if not filename:
            console.print(r"[yellow]Usage: \i [file][/yellow]")
            return
            
        path = Path(filename)
        if not path.exists():
             console.print(f"[bold red]File '{filename}' not found.[/bold red]")
             return
             
        try:
            with open(path, 'r') as f:
                commands = json.load(f)
                
            if not isinstance(commands, list):
                console.print("[bold red]Error:[/bold red] JSON file must contain a list of command strings.")
                return

            for cmd_str in commands:
                if isinstance(cmd_str, str):
                    console.print(f"[dim]> {cmd_str}[/dim]")
                    self.process_command(cmd_str)
                else:
                    console.print(f"[yellow]Skipping non-string item: {cmd_str}[/yellow]")
                    
        except json.JSONDecodeError as e:
            console.print(f"[bold red]Error parsing JSON file:[/bold red] {e}")
        except Exception as e:
            console.print(f"[bold red]Error reading file:[/bold red] {e}")

    def process_command(self, text):
        parts = text.split()
        if not parts:
            return True # Continue
        
        cmd_root = parts[0].strip()
        args = parts[1:]

        if cmd_root.startswith('\\'):
             # Handle meta commands
             if cmd_root == r'\q':
                console.print("Bye!")
                sys.exit(0)
             elif cmd_root == r'\l':
                self.do_list()
             elif cmd_root == r'\c':
                self.do_connect(args[0] if args else None)
             elif cmd_root == r'\d':
                target = args[0] if args else None
                self.do_describe(target)
             elif cmd_root == r'\s' or cmd_root == r'\stats':
                target = args[0] if args else None
                self.do_stats(target)
             elif cmd_root == r'\?':
                self.do_help()
             elif cmd_root == r'\i':
                self.execute_file(args[0] if args else None)
             else:
                 console.print(f"[red]Unknown command: {cmd_root}[/red]")
        else:
             # Default behavior: Treat as SQL
             self.execute_sql(text)

    def run(self):
        self.do_help()
        while True:
            try:
                text = self.session.prompt(self.get_prompt())
                self.process_command(text)
            except KeyboardInterrupt:
                continue
            except EOFError:
                break
            except Exception as e:
                console.print(f"[bold red]Error:[/bold red] {e}")

if __name__ == "__main__":
    app = TypesenseCLI()
    app.run()
