//! HundunOS Skill Remote
//!
//! Secure remote skill installation with SSRF protection.
//! Migrated from JavaScript skill-remote.js.

use regex::Regex;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::Duration;
use thiserror::Error;
use url::Url;

lazy_static::lazy_static! {
    /// Blocked hostname patterns
    static ref BLOCKED_HOSTNAME_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)^localhost$").unwrap(),
        Regex::new(r"(?i)\.local$").unwrap(),
        Regex::new(r"(?i)\.internal$").unwrap(),
        Regex::new(r"(?i)^internal\.").unwrap(),
        Regex::new(r"(?i)^local\.").unwrap(),
    ];
    
    /// Allowed protocols
    static ref ALLOWED_PROTOCOLS: Vec<&'static str> = vec!["http:", "https:"];
}

/// Private IP ranges for SSRF protection
pub struct PrivateIpRanges;

impl PrivateIpRanges {
    /// Check if an IPv4 address is private
    pub fn is_private_ipv4(ip: &Ipv4Addr) -> bool {
        // 10.0.0.0/8
        if ip.octets()[0] == 10 {
            return true;
        }
        
        // 172.16.0.0/12
        let octets = ip.octets();
        if octets[0] == 172 && (16..=31).contains(&octets[1]) {
            return true;
        }
        
        // 192.168.0.0/16
        if octets[0] == 192 && octets[1] == 168 {
            return true;
        }
        
        // 127.0.0.0/8 (loopback)
        if octets[0] == 127 {
            return true;
        }
        
        // 169.254.0.0/16 (link-local)
        if octets[0] == 169 && octets[1] == 254 {
            return true;
        }
        
        // 0.0.0.0/8 (current network)
        if octets[0] == 0 {
            return true;
        }
        
        false
    }
    
    /// Check if an IPv6 address is private
    pub fn is_private_ipv6(ip: &Ipv6Addr) -> bool {
        // Loopback ::1
        if ip.is_loopback() {
            return true;
        }
        
        // Link-local fe80::/10
        let segments = ip.segments();
        if segments[0] & 0xffc0 == 0xfe80 {
            return true;
        }
        
        // Unique local fc00::/7
        if segments[0] & 0xfe00 == 0xfc00 {
            return true;
        }
        
        false
    }
    
    /// Check if any IP address is private
    pub fn is_private(ip: &IpAddr) -> bool {
        match ip {
            IpAddr::V4(ipv4) => Self::is_private_ipv4(ipv4),
            IpAddr::V6(ipv6) => Self::is_private_ipv6(ipv6),
        }
    }
}

/// SSRF validation error types
#[derive(Error, Debug, Clone, PartialEq)]
pub enum SsrfError {
    #[error("Invalid URL format: {0}")]
    InvalidUrl(String),
    
    #[error("Protocol not allowed: {0}. Only HTTP and HTTPS are allowed.")]
    ProtocolNotAllowed(String),
    
    #[error("Hostname is blocked: {0}")]
    HostnameBlocked(String),
    
    #[error("IP address is private/blocked: {0}")]
    PrivateIp(String),
    
    #[error("DNS resolution failed for hostname: {0}")]
    DnsResolutionFailed(String),
    
    #[error("Request timeout")]
    Timeout,
    
    #[error("Response too large: {0} bytes (max: {1})")]
    ResponseTooLarge(usize, usize),
    
    #[error("HTTP error: {0}")]
    HttpError(String),
}

/// SSRF validation options
#[derive(Debug, Clone)]
pub struct SsrfOptions {
    /// Maximum response size in bytes (default: 10MB)
    pub max_response_size: usize,
    /// Request timeout in seconds (default: 15)
    pub timeout_seconds: u64,
    /// Allow localhost (default: false)
    pub allow_localhost: bool,
}

impl Default for SsrfOptions {
    fn default() -> Self {
        Self {
            max_response_size: 10 * 1024 * 1024, // 10MB
            timeout_seconds: 15,
            allow_localhost: false,
        }
    }
}

/// Validate a URL for SSRF safety
///
/// # Arguments
/// * `url_str` - URL string to validate
///
/// # Returns
/// * `Ok(Url)` if URL is safe
/// * `Err(SsrfError)` if URL is blocked
pub fn validate_url(url_str: &str) -> Result<Url, SsrfError> {
    // Parse URL
    let url = Url::parse(url_str)
        .map_err(|e| SsrfError::InvalidUrl(e.to_string()))?;
    
    // Check protocol
    let scheme = url.scheme();
    if !ALLOWED_PROTOCOLS.contains(&scheme) {
        return Err(SsrfError::ProtocolNotAllowed(scheme.to_string()));
    }
    
    // Get hostname
    let hostname = url.host_str()
        .ok_or_else(|| SsrfError::InvalidUrl("Missing hostname".to_string()))?;
    
    // Check blocked hostname patterns
    for pattern in BLOCKED_HOSTNAME_PATTERNS.iter() {
        if pattern.is_match(hostname) {
            return Err(SsrfError::HostnameBlocked(hostname.to_string()));
        }
    }
    
    // Resolve DNS and check IP
    let ips = dns_lookup::lookup_host(hostname)
        .map_err(|e| SsrfError::DnsResolutionFailed(format!("{}: {}", hostname, e)))?;
    
    for ip in ips {
        if PrivateIpRanges::is_private(&ip) {
            return Err(SsrfError::PrivateIp(ip.to_string()));
        }
    }
    
    Ok(url)
}

/// Safe HTTP client with SSRF protection
pub struct SafeHttpClient {
    client: reqwest::Client,
    options: SsrfOptions,
}

impl SafeHttpClient {
    /// Create a new safe HTTP client
    pub fn new(options: SsrfOptions) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(options.timeout_seconds))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap();
        
        Self { client, options }
    }
    
    /// Safely fetch content from a URL
    ///
    /// # Arguments
    /// * `url_str` - URL to fetch
    ///
    /// # Returns
    /// * `Ok(String)` with response body
    /// * `Err(SsrfError)` on failure
    pub async fn fetch(&self, url_str: &str) -> Result<String, SsrfError> {
        // Validate URL first
        let url = validate_url(url_str)?;
        
        // Make request
        let response = self.client
            .get(url.clone())
            .send()
            .await
            .map_err(|e| SsrfError::HttpError(e.to_string()))?;
        
        // Check status
        if !response.status().is_success() {
            return Err(SsrfError::HttpError(
                format!("HTTP {}: {}", response.status().as_u16(), url)
            ));
        }
        
        // Check content length
        if let Some(content_length) = response.content_length() {
            if content_length as usize > self.options.max_response_size {
                return Err(SsrfError::ResponseTooLarge(
                    content_length as usize,
                    self.options.max_response_size
                ));
            }
        }
        
        // Get body with size limit
        let body = response.text().await
            .map_err(|e| SsrfError::HttpError(e.to_string()))?;
        
        if body.len() > self.options.max_response_size {
            return Err(SsrfError::ResponseTooLarge(
                body.len(),
                self.options.max_response_size
            ));
        }
        
        Ok(body)
    }
}

impl Default for SafeHttpClient {
    fn default() -> Self {
        Self::new(SsrfOptions::default())
    }
}

/// Install result
#[derive(Debug, Clone)]
pub struct InstallResult {
    pub success: bool,
    pub spec: Option<SkillSpec>,
    pub error: Option<String>,
}

/// Skill specification
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillSpec {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub triggers: Vec<String>,
    pub tools: Vec<String>,
    pub system_prompt: Option<String>,
}

/// Install skill from URL
pub async fn install_from_url(url: &str, options: Option<SsrfOptions>) -> InstallResult {
    let client = SafeHttpClient::new(options.unwrap_or_default());
    
    let content = match client.fetch(url).await {
        Ok(c) => c,
        Err(e) => return InstallResult {
            success: false,
            spec: None,
            error: Some(e.to_string()),
        },
    };
    
    // Parse YAML content
    let spec = match parse_skill_yaml(&content) {
        Ok(s) => s,
        Err(e) => return InstallResult {
            success: false,
            spec: None,
            error: Some(format!("Failed to parse skill: {}", e)),
        },
    };
    
    InstallResult {
        success: true,
        spec: Some(spec),
        error: None,
    }
}

/// Parse skill YAML content
fn parse_skill_yaml(content: &str) -> Result<SkillSpec, String> {
    // Simple YAML parser for skill definitions
    let mut spec = SkillSpec {
        name: String::new(),
        version: "1.0.0".to_string(),
        description: None,
        triggers: Vec::new(),
        tools: Vec::new(),
        system_prompt: None,
    };
    
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        
        if let Some(colon_pos) = line.find(':') {
            let key = line[..colon_pos].trim();
            let value = line[colon_pos + 1..].trim();
            
            match key {
                "name" => spec.name = value.to_string(),
                "version" => spec.version = value.to_string(),
                "description" => spec.description = Some(value.to_string()),
                "triggers" => spec.triggers = parse_yaml_array(value),
                "tools" => spec.tools = parse_yaml_array(value),
                "system_prompt" => spec.system_prompt = Some(value.to_string()),
                _ => {}
            }
        }
    }
    
    if spec.name.is_empty() {
        return Err("Missing skill name".to_string());
    }
    
    Ok(spec)
}

/// Parse YAML array value
fn parse_yaml_array(value: &str) -> Vec<String> {
    let value = value.trim();
    
    if value.starts_with('[') && value.ends_with(']') {
        let inner = &value[1..value.len()-1];
        return inner
            .split(',')
            .map(|s| s.trim().trim_matches('"').to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_private_ip_ranges() {
        // Private IPv4 ranges
        assert!(PrivateIpRanges::is_private_ipv4(&"10.0.0.1".parse().unwrap()));
        assert!(PrivateIpRanges::is_private_ipv4(&"172.16.0.1".parse().unwrap()));
        assert!(PrivateIpRanges::is_private_ipv4(&"192.168.1.1".parse().unwrap()));
        assert!(PrivateIpRanges::is_private_ipv4(&"127.0.0.1".parse().unwrap()));
        assert!(PrivateIpRanges::is_private_ipv4(&"169.254.1.1".parse().unwrap()));
        
        // Public IPv4
        assert!(!PrivateIpRanges::is_private_ipv4(&"8.8.8.8".parse().unwrap()));
        assert!(!PrivateIpRanges::is_private_ipv4(&"1.1.1.1".parse().unwrap()));
    }
    
    #[test]
    fn test_blocked_hostnames() {
        // These should fail validation (if DNS resolves to private IP)
        // localhost
        assert!(BLOCKED_HOSTNAME_PATTERNS[0].is_match("localhost"));
        assert!(BLOCKED_HOSTNAME_PATTERNS[0].is_match("LOCALHOST"));
        
        // *.local
        assert!(BLOCKED_HOSTNAME_PATTERNS[1].is_match("myserver.local"));
        
        // *.internal
        assert!(BLOCKED_HOSTNAME_PATTERNS[2].is_match("api.internal"));
        
        // internal.*
        assert!(BLOCKED_HOSTNAME_PATTERNS[3].is_match("internal.corp"));
    }
    
    #[test]
    fn test_validate_url_protocol() {
        // Invalid protocols
        assert!(matches!(
            validate_url("ftp://example.com/file"),
            Err(SsrfError::ProtocolNotAllowed(_))
        ));
        
        assert!(matches!(
            validate_url("javascript:alert(1)"),
            Err(SsrfError::ProtocolNotAllowed(_))
        ));
        
        assert!(matches!(
            validate_url("file:///etc/passwd"),
            Err(SsrfError::ProtocolNotAllowed(_))
        ));
    }
    
    #[tokio::test]
    async fn test_safe_fetch() {
        let client = SafeHttpClient::default();
        
        // This should work (public URL)
        // Note: actual network call, might fail in CI
        let result = client.fetch("https://httpbin.org/get").await;
        // We don't assert success because network might be unavailable
        println!("Fetch result: {:?}", result.is_ok());
    }
}
