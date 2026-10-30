import { useRef, useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNominatimAutocomplete } from "@/hooks/useNominatimAutocomplete";
import { MapPin, Loader2 } from "lucide-react";

export interface AddressValue {
  streetAddress: string;
  aptUnit: string;
  city: string;
  state: string;
  zipCode: string;
}

export const EMPTY_ADDRESS: AddressValue = {
  streetAddress: "",
  aptUnit: "",
  city: "",
  state: "",
  zipCode: "",
};

export function toAddressString(v: AddressValue): string {
  const segments: string[] = [];
  if (v.streetAddress.trim()) segments.push(v.streetAddress.trim());
  if (v.aptUnit.trim()) segments.push(v.aptUnit.trim());
  if (v.city.trim()) segments.push(v.city.trim());
  const stateZip = [v.state.trim(), v.zipCode.trim()].filter(Boolean).join(" ");
  if (stateZip) segments.push(stateZip);
  return segments.join(", ");
}

export function parseAddressString(address: string): AddressValue {
  if (!address?.trim()) return { ...EMPTY_ADDRESS };

  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return { ...EMPTY_ADDRESS };
  if (parts.length === 1) return { ...EMPTY_ADDRESS, streetAddress: parts[0] };

  const lastPart = parts[parts.length - 1];
  const stateZipMatch = lastPart.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  const stateOnlyMatch = lastPart.match(/^([A-Z]{2})$/);

  if (stateZipMatch && parts.length >= 3) {
    const state = stateZipMatch[1];
    const zipCode = stateZipMatch[2];
    const city = parts[parts.length - 2];
    const streetParts = parts.slice(0, parts.length - 2);
    return {
      streetAddress: streetParts[0] || "",
      aptUnit: streetParts.slice(1).join(", "),
      city,
      state,
      zipCode,
    };
  } else if (stateOnlyMatch && parts.length >= 3) {
    const state = stateOnlyMatch[1];
    const city = parts[parts.length - 2];
    const streetParts = parts.slice(0, parts.length - 2);
    return {
      streetAddress: streetParts[0] || "",
      aptUnit: streetParts.slice(1).join(", "),
      city,
      state,
      zipCode: "",
    };
  } else {
    return {
      streetAddress: parts[0],
      aptUnit: "",
      city: parts.length > 1 ? parts[parts.length - 1] : "",
      state: "",
      zipCode: "",
    };
  }
}

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"],
] as const;

interface AddressFieldsProps {
  value: AddressValue;
  onChange: (parts: AddressValue, assembled: string) => void;
  required?: boolean;
  idPrefix?: string;
}

export function AddressFields({
  value,
  onChange,
  required = false,
  idPrefix = "addr",
}: AddressFieldsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { suggestions, loading, clear } = useNominatimAutocomplete(
    dropdownOpen || value.streetAddress.length >= 3 ? value.streetAddress : ""
  );

  // Open dropdown whenever new suggestions arrive
  useEffect(() => {
    if (suggestions.length > 0) {
      setDropdownOpen(true);
      setHighlightedIdx(-1);
    }
  }, [suggestions]);

  function update(field: keyof AddressValue, val: string) {
    const next = { ...value, [field]: val };
    onChange(next, toAddressString(next));
  }

  function pickSuggestion(idx: number) {
    const s = suggestions[idx];
    if (!s) return;
    const next: AddressValue = {
      ...value,
      streetAddress: s.street,
      city: s.city,
      state: s.state,
      zipCode: s.zipCode,
    };
    onChange(next, toAddressString(next));
    setDropdownOpen(false);
    clear();
  }

  function handleStreetKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIdx >= 0) {
      e.preventDefault();
      pickSuggestion(highlightedIdx);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setHighlightedIdx(-1);
    }
  }

  function handleStreetBlur() {
    blurTimerRef.current = setTimeout(() => setDropdownOpen(false), 150);
  }

  function handleStreetFocus() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    if (suggestions.length > 0) setDropdownOpen(true);
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[highlightedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  return (
    <div className="space-y-3">
      {/* Street address with autocomplete dropdown */}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-street`}>
          Street Address {required && <span className="text-destructive">*</span>}
          <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
            <MapPin className="h-3 w-3" /> Start typing for suggestions
          </span>
        </Label>
        <div className="relative">
          <Input
            id={`${idPrefix}-street`}
            value={value.streetAddress}
            onChange={(e) => {
              update("streetAddress", e.target.value);
              if (e.target.value.length < 3) {
                setDropdownOpen(false);
                clear();
              }
            }}
            onKeyDown={handleStreetKeyDown}
            onFocus={handleStreetFocus}
            onBlur={handleStreetBlur}
            placeholder="123 Main Street"
            required={required}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={dropdownOpen}
            aria-controls={dropdownOpen ? `${idPrefix}-suggestions` : undefined}
            aria-activedescendant={
              highlightedIdx >= 0
                ? `${idPrefix}-suggestion-${highlightedIdx}`
                : undefined
            }
            data-testid={`${idPrefix}-street`}
            className={loading ? "pr-8" : ""}
          />
          {loading && (
            <Loader2
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none"
              aria-hidden
            />
          )}

          {/* Suggestion dropdown */}
          {dropdownOpen && suggestions.length > 0 && (
            <ul
              ref={listRef}
              id={`${idPrefix}-suggestions`}
              role="listbox"
              className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-56 overflow-y-auto py-1"
              onMouseDown={(e) => e.preventDefault()}
            >
              {suggestions.map((s, i) => (
                <li
                  key={i}
                  id={`${idPrefix}-suggestion-${i}`}
                  role="option"
                  aria-selected={i === highlightedIdx}
                  className={[
                    "px-3 py-2 text-sm cursor-pointer select-none leading-snug transition-colors",
                    i === highlightedIdx
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-accent/60 hover:text-accent-foreground",
                  ].join(" ")}
                  onMouseEnter={() => setHighlightedIdx(i)}
                  onMouseDown={() => pickSuggestion(i)}
                >
                  <span className="font-medium">{s.street}</span>
                  {(s.city || s.state) && (
                    <span className="ml-1 text-muted-foreground">
                      {[s.city, [s.state, s.zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Apt / Unit */}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-apt`}>
          Apt / Unit / Floor{" "}
          <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>
        <Input
          id={`${idPrefix}-apt`}
          value={value.aptUnit}
          onChange={(e) => update("aptUnit", e.target.value)}
          placeholder="Apt 4B, Unit 12, Floor 3…"
          autoComplete="address-line2"
          data-testid={`${idPrefix}-apt`}
        />
      </div>

      {/* City + State + ZIP */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_130px_100px]">
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <Label htmlFor={`${idPrefix}-city`}>
            City {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${idPrefix}-city`}
            value={value.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Brooklyn"
            required={required}
            autoComplete="address-level2"
            data-testid={`${idPrefix}-city`}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-state`}>
            State {required && <span className="text-destructive">*</span>}
          </Label>
          <Select value={value.state} onValueChange={(val) => update("state", val)}>
            <SelectTrigger id={`${idPrefix}-state`} data-testid={`${idPrefix}-state`}>
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map(([abbr, name]) => (
                <SelectItem key={abbr} value={abbr}>
                  {abbr}: {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-zip`}>
            ZIP {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${idPrefix}-zip`}
            value={value.zipCode}
            onChange={(e) =>
              update("zipCode", e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            placeholder="11201"
            inputMode="numeric"
            maxLength={5}
            required={required}
            autoComplete="postal-code"
            data-testid={`${idPrefix}-zip`}
          />
        </div>
      </div>
    </div>
  );
}
