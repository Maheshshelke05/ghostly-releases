import React, { useEffect, useRef, useState } from "react";

interface LiveTranscriptBarProps {
  text: string;
}

export const LiveTranscriptBar: React.FC<LiveTranscriptBarProps> = ({ text }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState("");
  const [lastWord, setLastWord] = useState("");

  useEffect(() => {
    if (!text) {
      setDisplayText("");
      setLastWord("");
      return;
    }

    const words = text.trim().split(/\s+/);
    const newLastWord = words[words.length - 1] || "";
    
    setDisplayText(text);
    setLastWord(newLastWord);

    // Auto scroll to right
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [text]);

  if (!displayText) {
    return (
      <span className="text-[12px] font-sans flex-1" style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
        Listening for interviewer...
      </span>
    );
  }

  const words = displayText.trim().split(/\s+/);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-x-auto flex items-center gap-1.5"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        return (
          <span
            key={i}
            className="text-[12px] font-sans whitespace-nowrap"
            style={{
              color: isLast ? "#d9a877" : "rgba(255,255,255,0.7)",
              transition: "color 0.5s ease",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
