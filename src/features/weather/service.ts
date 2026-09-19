// Minimal weather service stub. If an env var `OPENWEATHER_API_KEY` is provided,
// this will attempt to fetch current weather. Otherwise it returns a safe mock.

export type WeatherData = {
  location?: string;
  tempC?: number;
  condition?: string;
};

export async function getWeatherForLocation(
  lat: number,
  lon: number,
): Promise<WeatherData> {
  let key = process.env.OPENWEATHER_API_KEY || "";
  try {
    // fall back to localStorage-stored key (set via app Settings)
    const stored = localStorage.getItem("OPENWEATHER_API_KEY");
    if (!key && stored) key = stored;
  } catch (e) {}
  if (!key) {
    // Mock response
    return { location: "Unknown", tempC: 20, condition: "clear" };
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`,
    );
    if (!res.ok)
      return { location: "Unknown", tempC: 20, condition: "unknown" };
    const j = await res.json();
    return {
      location: j.name,
      tempC: j.main?.temp,
      condition: j.weather?.[0]?.main,
    };
  } catch (e) {
    return { location: "Unknown", tempC: 20, condition: "unknown" };
  }
}
