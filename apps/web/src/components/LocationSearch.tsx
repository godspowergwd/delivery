import { clsx } from 'clsx';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { PlaceSuggestion } from '../lib/geocode';
import { currentLocationPlace, suggestPlaces } from '../lib/geocode';
import { toast } from '../lib/realtime';
import { Field, Input } from './ui';
import { CheckIcon, LeafIcon, LocateIcon, MapPinIcon, SearchIcon, StoreIcon } from './icons';

const SEARCH_DEBOUNCE_MS = 250;

const KIND_ICON: Record<PlaceSuggestion['kind'], (className?: string) => ReactNode> = {
  landmark: (className) => <StoreIcon className={className} />,
  street: (className) => <MapPinIcon className={className} />,
  area: (className) => <MapPinIcon className={className} />,
  gps: (className) => <LocateIcon className={className} />,
};

/**
 * Bolt-Food style address search: instant suggestions while typing, real
 * places only (local Mallam/Accra dataset first, then geocoding), keyboard
 * navigation, and balanced red-and-green control states.
 *
 * Green = location / availability affordances (suggestions, current location,
 * selected state). Red = the search affordance and clear action.
 */
export function LocationSearch({
  value,
  onChange,
  onSelect,
  selected = null,
  label = 'Delivery address',
  placeholder = 'Start typing an address — e.g. Mallam…',
  required,
  id,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onSelect: (place: PlaceSuggestion | null) => void;
  selected?: PlaceSuggestion | null;
  label?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  className?: string;
}) {
  const reactId = useId();
  const inputId = id ?? `location-${reactId}`;
  const listId = `${inputId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef<{ controller: AbortController; timer: number } | null>(null);

  /* Debounced fetch with abort of the previous keystroke's request. */
  useEffect(() => {
    if (requestRef.current) {
      window.clearTimeout(requestRef.current.timer);
      requestRef.current.controller.abort();
      requestRef.current = null;
    }
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      suggestPlaces(query, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setActiveIndex(-1);
          setOpen(true);
        })
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    requestRef.current = { controller, timer };
    return () => {
      window.clearTimeout(timer);
    };
  }, [value]);

  /* Close when tapping outside (mouse + touch). */
  useEffect(() => {
    const onOutside = (event: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, []);

  const pick = (place: PlaceSuggestion) => {
    onSelect(place);
    onChange(place.label);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const clear = () => {
    onSelect(null);
    onChange('');
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place = currentLocationPlace({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        pick(place);
        toast('Current location captured', 'success');
      },
      (error) => {
        toast(
          error.code === 1
            ? 'Location access denied. Please type your address.'
            : 'Could not get your location. Please type your address.',
          'error',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(suggestions.length > 0);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      pick(suggestions[activeIndex]);
    }
  };

  const showList = open && (suggestions.length > 0 || searching);

  return (
    <div className={clsx('relative', className)} ref={wrapRef}>
      <Field
        label={label}
        hint={selected ? `Pinned at ${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}` : undefined}
      >
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
            required={required}
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value);
              // Typing invalidates the previous selection immediately.
              if (selected) onSelect(null);
              setOpen(true);
            }}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            className="pr-24 pl-10"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {searching && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-red-100 border-t-green-600"
                aria-hidden="true"
              />
            )}
            {value && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear address"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-sm font-bold text-red-600 transition hover:bg-red-100 active:scale-95"
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
            <button
              type="button"
              onClick={useCurrentLocation}
              aria-label="Use my current location"
              title="Use my current location"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50 text-green-700 transition hover:bg-green-100 active:scale-95"
            >
              <LocateIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Field>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute z-30 mt-1 max-h-72 w-full divide-y divide-green-50 overflow-y-auto rounded-2xl border border-green-200 bg-white shadow-lift"
        >
          {searching && suggestions.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">Searching real places…</li>
          )}
          {suggestions.map((place, index) => {
            const active = index === activeIndex;
            const isSelected = selected?.id === place.id;
            return (
              <li key={place.id} role="none">
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(place)}
                  className={clsx(
                    'flex w-full items-center gap-3 px-3 py-3 text-left transition',
                    isSelected
                      ? 'bg-green-50 ring-1 ring-inset ring-green-600'
                      : active
                        ? 'bg-red-50'
                        : 'bg-white hover:bg-green-50',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-9 w-9 flex-none items-center justify-center rounded-xl',
                      isSelected || place.kind === 'gps'
                        ? 'bg-green-600 text-white'
                        : place.source === 'local'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-green-50 text-green-700',
                    )}
                    aria-hidden="true"
                  >
                    {KIND_ICON[place.kind]('h-4 w-4')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {place.label}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{place.address}</span>
                  </span>
                  {place.source === 'local' && (
                    <span className="food-chip flex-none" title="In the Mallam delivery area">
                      <LeafIcon className="h-3 w-3" aria-hidden="true" />
                      local
                    </span>
                  )}
                  {isSelected && (
                    <CheckIcon className="h-4 w-4 flex-none text-green-700" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && !searching && value.trim().length >= 2 && suggestions.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-lift">
          No real place matches “{value.trim()}”. Try a landmark like{' '}
          <span className="font-semibold text-green-700">Mallam Junction</span>.
        </div>
      )}
    </div>
  );
}
