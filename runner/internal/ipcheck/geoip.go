package ipcheck

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type geoIPResponse struct {
	Status      string `json:"status"`
	Country     string `json:"country"`
	CountryCode string `json:"countryCode"`
	Region      string `json:"region"`
	City        string `json:"city"`
}

var geoClient = &http.Client{Timeout: 10 * time.Second}

// CheckGeoIP looks up geographic information for an IP using ip-api.com
func CheckGeoIP(logger *slog.Logger, ip string) (country, countryCode, region, city string, err error) {
	l := logger.With("module", "ipcheck.geoip")

	apiURL := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,region,city", ip)

	resp, err := geoClient.Get(apiURL)
	if err != nil {
		l.Error("Geo API fail",
			"api_url", apiURL,
			"error_detail", err.Error(),
		)
		return "", "", "", "", fmt.Errorf("geoip request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		l.Error("Geo API fail",
			"api_url", apiURL,
			"error_detail", fmt.Sprintf("HTTP %d", resp.StatusCode),
		)
		return "", "", "", "", fmt.Errorf("geoip API returned %d", resp.StatusCode)
	}

	var result geoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		l.Error("Geo API fail",
			"api_url", apiURL,
			"error_detail", err.Error(),
		)
		return "", "", "", "", fmt.Errorf("geoip decode failed: %w", err)
	}

	if result.Status != "success" {
		l.Error("Geo API fail",
			"api_url", apiURL,
			"error_detail", fmt.Sprintf("status=%s", result.Status),
		)
		return "", "", "", "", fmt.Errorf("geoip lookup failed: status=%s", result.Status)
	}

	l.Info("Geo lookup done",
		"observed_ip", ip,
		"actual_country", result.CountryCode,
		"actual_city", result.City,
	)

	return result.Country, result.CountryCode, result.Region, result.City, nil
}

// CheckGeoMatch compares expected country with actual country code
func CheckGeoMatch(logger *slog.Logger, expectedCountry, actualCountryCode, ip string) bool {
	l := logger.With("module", "ipcheck.geoip")

	if expectedCountry == "" {
		// No expected country set — consider it a match
		return true
	}

	match := strings.EqualFold(expectedCountry, actualCountryCode)
	if !match {
		l.Warn("Geo mismatch",
			"expected_country", expectedCountry,
			"actual_country", actualCountryCode,
			"observed_ip", ip,
		)
	}

	return match
}
