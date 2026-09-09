import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon";
import { getRequestStatusLabel } from "../../utils/requestStatus";

const resultLimit = 7;

function requestSearchValues(request) {
  return [
    request.id,
    request.trackingNumber,
    request.title,
    request.description,
    request.partyName,
    request.endUser,
    request.requester,
    request.requesterUsername,
    request.department,
    request.categoryName,
    request.categoryCode,
    request.priority,
    request.riskLevel,
    request.status,
    getRequestStatusLabel(request.status),
    request.assignedReviewer,
    ...(request.assignedReviewers || []).flatMap((reviewer) => [
      reviewer.name,
      reviewer.username,
      reviewer.email,
    ]),
    request.assignedManager,
    request.assignedDepartmentApprover,
    request.deadline,
    request.submittedAt,
    request.lastAction,
    request.lastActionBy,
    ...(request.documents || []).map((document) => document.name),
    ...(request.reviewerComments || []).flatMap((comment) => [
      comment.authorName,
      comment.reviewerName,
      comment.text,
    ]),
  ].filter(Boolean);
}

function rankRequest(request, normalizedQuery) {
  const identifier = String(request.trackingNumber || request.id || "").toLowerCase();
  const title = String(request.title || "").toLowerCase();
  const requester = `${request.requester || ""} ${request.requesterUsername || ""}`.toLowerCase();

  if (identifier === normalizedQuery) return 0;
  if (identifier.startsWith(normalizedQuery)) return 1;
  if (title.startsWith(normalizedQuery)) return 2;
  if (requester.includes(normalizedQuery)) return 3;
  return 4;
}

function GlobalRequestSearch({ requests, onSelectRequest }) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    return requests
      .filter((request) => {
        const searchableText = requestSearchValues(request).join(" ").toLowerCase();
        return queryTokens.every((token) => searchableText.includes(token));
      })
      .sort((first, second) => {
        const rankDifference = rankRequest(first, normalizedQuery) - rankRequest(second, normalizedQuery);
        if (rankDifference) return rankDifference;
        return (Date.parse(second.submittedAtIso || second.submittedAt || "") || 0)
          - (Date.parse(first.submittedAtIso || first.submittedAt || "") || 0);
      });
  }, [normalizedQuery, requests]);
  const visibleMatches = matches.slice(0, resultLimit);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    function focusGlobalSearch(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(Boolean(query.trim()));
      }
    }

    window.addEventListener("keydown", focusGlobalSearch);
    return () => window.removeEventListener("keydown", focusGlobalSearch);
  }, [query]);

  useEffect(() => {
    setActiveIndex(visibleMatches.length ? 0 : -1);
  }, [normalizedQuery, visibleMatches.length]);

  function selectRequest(requestId) {
    onSelectRequest(requestId);
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen || visibleMatches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % visibleMatches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? visibleMatches.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectRequest(visibleMatches[activeIndex].id);
    }
  }

  return (
    <div className="global-request-search" ref={containerRef}>
      <div className={`global-search-field ${isOpen ? "is-open" : ""}`}>
        <Icon name="search" size={18} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(Boolean(event.target.value.trim()));
          }}
          onFocus={() => setIsOpen(Boolean(query.trim()))}
          onKeyDown={handleKeyDown}
          placeholder="Search requests, requesters, IDs, status…"
          aria-label="Search requests"
          aria-autocomplete="list"
          aria-controls="global-request-search-results"
          aria-expanded={isOpen}
          aria-activedescendant={activeIndex >= 0 ? `global-request-result-${activeIndex}` : undefined}
        />
        {query ? (
          <button
            type="button"
            className="global-search-clear"
            onClick={() => {
              setQuery("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear request search"
          >
            Clear
          </button>
        ) : (
          <span className="global-search-shortcut">Ctrl K</span>
        )}
      </div>

      {isOpen && (
        <div className="global-search-popover">
          <div className="global-search-heading">
            <span>Request search</span>
            <small>{matches.length} {matches.length === 1 ? "result" : "results"}</small>
          </div>

          {visibleMatches.length === 0 ? (
            <div className="global-search-empty">
              <Icon name="search" size={22} />
              <div><strong>No matching requests</strong><p>Try a request ID, requester, title, department, or status.</p></div>
            </div>
          ) : (
            <ul id="global-request-search-results" role="listbox" aria-label="Matching requests">
              {visibleMatches.map((request, index) => (
                <li key={request.id}>
                  <button
                    id={`global-request-result-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={activeIndex === index ? "is-active" : ""}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectRequest(request.id)}
                  >
                    <span className="global-search-result-icon"><Icon name="file" size={17} /></span>
                    <span className="global-search-result-copy">
                      <span><strong>{request.title || "Untitled request"}</strong><small>{request.trackingNumber || request.id}</small></span>
                      <small>{request.requester || "Unknown requester"} · {request.department || "No department"} · {request.categoryName || "Uncategorized"}</small>
                    </span>
                    <span className="global-search-result-status">{getRequestStatusLabel(request.status)}</span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="global-search-footer">
            <span>Only requests available to your account are shown.</span>
            {matches.length > resultLimit && <small>Showing first {resultLimit}</small>}
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalRequestSearch;
