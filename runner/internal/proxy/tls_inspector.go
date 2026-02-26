package proxy

import "crypto/tls"

// TLSVersionString converts a TLS version uint16 to a human-readable string
func TLSVersionString(version uint16) string {
	switch version {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return "unknown"
	}
}

// IsWeakTLSVersion returns true if the TLS version is considered weak
func IsWeakTLSVersion(version uint16) bool {
	return version < tls.VersionTLS12
}

// IsWeakCipher returns true for cipher suites considered insecure
func IsWeakCipher(cipher uint16) bool {
	name := tls.CipherSuiteName(cipher)
	// RC4 and DES-based ciphers are weak
	for _, weak := range []string{"RC4", "DES", "3DES", "NULL"} {
		if len(name) > 0 && contains(name, weak) {
			return true
		}
	}
	return false
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
