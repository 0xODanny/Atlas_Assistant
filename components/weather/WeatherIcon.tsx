type WeatherIconProps = {
  condition: string;
};

export function WeatherIcon({ condition }: WeatherIconProps) {
  return (
    <svg className="weather-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" role="img" aria-label={condition}>
      <IconPaths condition={condition} />
    </svg>
  );
}

function IconPaths({ condition }: WeatherIconProps) {
  const stroke = "currentColor";
  const common = { stroke, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (condition === "Clear") {
    return <circle cx="10" cy="10" r="3.25" {...common} />;
  }
  if (condition === "Mostly clear") {
    return (
      <>
        <circle cx="10" cy="10" r="3" {...common} />
        <path d="M10 3.2v1.5M10 15.3v1.5M3.2 10h1.5M15.3 10h1.5" {...common} />
      </>
    );
  }
  if (condition === "Partly cloudy") {
    return (
      <>
        <circle cx="7.4" cy="7.6" r="2.2" {...common} />
        <path d="M7.2 12.2h6.1a2.35 2.35 0 0 0 .2-4.7 3.15 3.15 0 0 0-6.05 1.05 2.2 2.2 0 0 0-.25 3.65Z" {...common} />
      </>
    );
  }
  if (condition === "Fog") {
    return <path d="M4 7.5h12M3.2 10h13.6M4 12.5h12" {...common} />;
  }
  if (condition === "Drizzle") {
    return (
      <>
        <path d="M5.2 9.2h7.4a2.3 2.3 0 0 0 .15-4.6 3 3 0 0 0-5.8.9A2.15 2.15 0 0 0 5.2 9.2Z" {...common} />
        <path d="M7.2 12.2v1.5M10.2 13.2v1.5M13.2 12.2v1.5" {...common} />
      </>
    );
  }
  if (condition === "Rain") {
    return (
      <>
        <path d="M5 9.1h8.2a2.45 2.45 0 0 0 .2-4.9 3.2 3.2 0 0 0-6.2 1A2.3 2.3 0 0 0 5 9.1Z" {...common} />
        <path d="M7 11.6v2.6M10 12.4v2.6M13 11.6v2.6" {...common} />
      </>
    );
  }
  if (condition === "Snow") {
    return <path d="M10 3.5v13M4.4 6.6l11.2 6.8M15.6 6.6 4.4 13.4" {...common} />;
  }
  if (condition === "Showers") {
    return (
      <>
        <path d="M4.6 8.6h8.4a2.4 2.4 0 0 0 .2-4.8 3.15 3.15 0 0 0-6.1 1 2.25 2.25 0 0 0-2.5 3.8Z" {...common} />
        <path d="M6.4 11.2 5.2 14.2M10 11.2 8.8 14.2M13.6 11.2l-1.2 3" {...common} />
      </>
    );
  }
  if (condition === "Thunderstorm") {
    return (
      <>
        <path d="M4.8 8.4h8.5a2.35 2.35 0 0 0 .15-4.7 3.1 3.1 0 0 0-6 1 2.2 2.2 0 0 0-2.65 3.7Z" {...common} />
        <path d="M11.2 10.2 8.6 13.6h2.3L9.2 16.8" {...common} />
      </>
    );
  }
  return <path d="M4.2 12.4h10.2a2.7 2.7 0 0 0 .2-5.4 3.6 3.6 0 0 0-6.9 1.15 2.55 2.55 0 0 0-3.5 4.25Z" {...common} />;
}
