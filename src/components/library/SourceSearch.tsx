"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

interface SourceResult {
  id: string;
  title: string;
  url: string;
  bookSeries?: string | null;
  bookVolume?: number | null;
  bookPage?: number | null;
}

interface SourceSearchProps {
  onSelect: (source: SourceResult) => void;
  placeholder?: string;
}

export function SourceSearch({
  onSelect,
  placeholder = "חיפוש מקור...",
}: SourceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/article-sources?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.sources ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(result: SourceResult) {
    onSelect(result);
    setQuery("");
    setOpen(false);
    setResults([]);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pe-9"
        />
        {loading && (
          <Loader2 className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground text-center">לא נמצאו תוצאות</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="w-full text-start px-4 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-b-0"
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{r.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
