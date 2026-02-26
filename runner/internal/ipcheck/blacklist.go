package ipcheck

import (
	"fmt"
	"log/slog"
	"net"
	"strings"
)

// DNSBLServers is the list of DNSBL servers to check
var DNSBLServers = []string{
	"zen.spamhaus.org",
	"b.barracudacentral.org",
	"bl.spamcop.net",
	"dnsbl.sorbs.net",
}

// CheckBlacklist checks an IP against DNSBL servers
// Returns: queried count, listed count, source names, error
func CheckBlacklist(logger *slog.Logger, ip string) (queried, listed int, sources []string, err error) {
	l := logger.With("module", "ipcheck.blacklist")

	reversed := reverseIP(ip)
	if reversed == "" {
		return 0, 0, nil, fmt.Errorf("invalid IP address: %s", ip)
	}

	l.Info("Blacklist check start",
		"observed_ip", ip,
		"dnsbl_count", len(DNSBLServers),
	)

	for _, server := range DNSBLServers {
		queried++
		lookup := fmt.Sprintf("%s.%s", reversed, server)

		addrs, lookupErr := net.LookupHost(lookup)
		if lookupErr != nil {
			if isDNSNotFound(lookupErr) {
				// IP is clean on this server
				continue
			}
			// Other DNS error — log warning but continue
			l.Warn("DNSBL query fail",
				"dnsbl_server", server,
				"error_detail", lookupErr.Error(),
			)
			continue
		}

		// DNS resolved — IP is listed
		if len(addrs) > 0 {
			listed++
			sources = append(sources, server)
			l.Warn("IP listed (dirty)",
				"observed_ip", ip,
				"blacklist_source", server,
				"blacklists_listed", listed,
			)
		}
	}

	if listed == 0 {
		l.Info("IP clean",
			"observed_ip", ip,
			"blacklists_queried", queried,
		)
	}

	return queried, listed, sources, nil
}

// reverseIP reverses the octets of an IPv4 address
// "1.2.3.4" -> "4.3.2.1"
func reverseIP(ip string) string {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return ""
	}
	return fmt.Sprintf("%s.%s.%s.%s", parts[3], parts[2], parts[1], parts[0])
}

// isDNSNotFound checks if the error is a DNS "not found" error
func isDNSNotFound(err error) bool {
	dnsErr, ok := err.(*net.DNSError)
	if !ok {
		return false
	}
	return dnsErr.IsNotFound
}
