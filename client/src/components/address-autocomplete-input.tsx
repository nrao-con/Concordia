import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useNominatimAutocomplete } from "@/hooks/useNominatimAutocomplete";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";

export interface VerifiedAddressSelection {
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  lon: number;
  osmType?: string;
  osmId?: number;
}

interface AddressAutocompleteInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onVerificationChange?: (selection: VerifiedAddressSelection | null) => void;
  placeholder?: string;
  required?: boolean;
  dataTestId?: string;
}

export function AddressAutocompleteInput({
  id,
  value,
  onChange,
  onVerificationChange,
  placeholder = "123 Main St, Bronx, NY 10451",
  required = false,
  dataTestId,
}: AddressAutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<VerifiedAddressSelection | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { suggestions, loading, clear } = useNominatimAutocomplete(value);

  useEffect(() => {
    if (suggestions.length > 0 && document.activeElement?.id === id) {
      setIsOpen(true);
      setHighlightedIndex(-1);
    }
  }, [suggestions, id]);

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  function handleChange(nextValue: string) {
    setSelectedSuggestion(null);
    onVerificationChange?.(null);
    onChange(nextValue);
    if (nextValue.trim().length < 3) {
      setIsOpen(false);
      clear();
    }
  }

  function selectSuggestion(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    const selection: VerifiedAddressSelection = {
      label: suggestion.label,
      street: suggestion.street,
      city: suggestion.city,
      state: suggestion.state,
      zipCode: suggestion.zipCode,
      lat: suggestion.lat,
      lon: suggestion.lon,
      osmType: suggestion.osmType,
      osmId: suggestion.osmId,
    };
    onChange(suggestion.label);
    setSelectedSuggestion(selection);
    onVerificationChange?.(selection);
    setIsOpen(false);
    setHighlightedIndex(-1);
    clear();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      selectSuggestion(highlightedIndex);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }

  function handleFocus() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    if (suggestions.length > 0) setIsOpen(true);
  }

  function handleBlur() {
    blurTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  }

  const hasShortAddress = value.trim().length > 0 && value.trim().length < 5;
  const hasUnverifiedAddress = value.trim().length >= 5 && !selectedSuggestion;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          autoComplete="street-address"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? `${id}-suggestions` : undefined}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${id}-suggestion-${highlightedIndex}` : undefined
          }
           aria-invalid={hasShortAddress || hasUnverifiedAddress}
          data-testid={dataTestId}
          className={loading ? "pr-8" : ""}
        />
        {loading && (
          <Loader2
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none"
            aria-label="Searching addresses"
          />
        )}
        {selectedSuggestion && !loading && (
          <CheckCircle2
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 pointer-events-none"
            aria-label="Address selected"
          />
        )}

        {isOpen && suggestions.length > 0 && (
          <ul
            ref={listRef}
            id={`${id}-suggestions`}
            role="listbox"
            className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-56 overflow-y-auto py-1"
            onMouseDown={(event) => event.preventDefault()}
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.label}-${index}`}
                id={`${id}-suggestion-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                className={[
                  "flex items-start gap-2 px-3 py-2 text-sm cursor-pointer select-none leading-snug transition-colors",
                  index === highlightedIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-popover-foreground hover:bg-accent/60 hover:text-accent-foreground",
                ].join(" ")}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={() => selectSuggestion(index)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{suggestion.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hasShortAddress ? (
        <p className="text-xs text-destructive" data-testid={`${dataTestId}-error`}>
          Enter at least 5 characters for the delivery address.
        </p>
       ) : selectedSuggestion ? (
        <p className="text-xs text-emerald-500" data-testid={`${dataTestId}-validated`}>
          Address selected from verified map data.
        </p>
      ) : value.trim().length > 0 ? (
        <p className="text-xs text-destructive" data-testid={`${dataTestId}-verification-error`}>
          Select an address from the verified map suggestions. Manual addresses cannot be used for delivery.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Start typing and select an address from the verified map suggestions. Manual addresses cannot be used for delivery.
        </p>
      )}
    </div>
  );
}