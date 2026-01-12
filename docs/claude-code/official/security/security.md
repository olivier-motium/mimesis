---
source: https://code.claude.com/docs/en/security
fetched: 2026-01-12
---

# Claude Code Security

## Overview

Claude Code is built with security at its core, developed according to Anthropic's comprehensive security program. Learn more at the [Anthropic Trust Center](https://trust.anthropic.com).

## How We Approach Security

### Security Foundation
Your code's security is paramount. Claude Code includes security safeguards and access to compliance resources (SOC 2 Type 2 report, ISO 27001 certificate, etc.).

### Permission-Based Architecture
- Claude Code uses **strict read-only permissions by default**
- Additional actions (editing files, running tests, executing commands) require **explicit permission**
- Users control whether to approve actions once or allow them automatically
- Designed to be transparent and secure—for example, bash commands require approval before executing

For detailed permission configuration, see [Identity and Access Management](/docs/en/iam).

### Built-In Protections

1. **Sandboxed bash tool**: Sandbox bash commands with filesystem and network isolation. Enable with `/sandbox` to define autonomous work boundaries

2. **Write access restriction**: Claude Code can only write to the folder where it was started and its subfolders—cannot modify parent directories without explicit permission

3. **Prompt fatigue mitigation**: Support for allowlisting frequently used safe commands per-user, per-codebase, or per-organization

4. **Accept Edits mode**: Batch accept multiple edits while maintaining permission prompts for commands with side effects

### User Responsibility
Claude Code only has the permissions you grant it. You're responsible for reviewing proposed code and commands for safety before approval.

## Protect Against Prompt Injection

Prompt injection attempts to override or manipulate Claude Code's instructions by inserting malicious text.

### Core Protections
- **Permission system**: Sensitive operations require explicit approval
- **Context-aware analysis**: Detects potentially harmful instructions
- **Input sanitization**: Prevents command injection
- **Command blocklist**: Blocks risky commands like `curl` and `wget` by default

### Privacy Safeguards
- Limited retention periods for sensitive information
- Restricted access to user session data
- User control over data training preferences

### Additional Safeguards
- **Network request approval**: Required by default
- **Isolated context windows**: Web fetch uses separate context
- **Trust verification**: First-time codebase runs and new MCP servers require verification
- **Command injection detection**: Suspicious bash commands require manual approval
- **Fail-closed matching**: Unmatched commands default to manual approval
- **Natural language descriptions**: Complex commands include explanations
- **Secure credential storage**: API keys and tokens are encrypted

**Windows WebDAV Security Risk**: Avoid enabling WebDAV or accessing `\\*` paths on Windows. WebDAV has been deprecated by Microsoft due to security risks.

## Best Practices for Working with Untrusted Content

1. Review suggested commands before approval
2. Avoid piping untrusted content directly to Claude
3. Verify proposed changes to critical files
4. Use virtual machines (VMs) for scripts and tool calls with external services
5. Report suspicious behavior with `/bug`

## MCP Security

Claude Code allows configuration of Model Context Protocol (MCP) servers. The list of allowed servers is configured in source code as part of Claude Code settings. Use MCP servers from providers you trust—Anthropic does not manage or audit MCP servers.

## Cloud Execution Security

When using [Claude Code on the web](/docs/en/claude-code-on-the-web):
- **Isolated virtual machines**: Each cloud session runs in an isolated, Anthropic-managed VM
- **Network access controls**: Limited by default, configurable per domain
- **Credential protection**: Handled through secure proxy with scoped credentials
- **Branch restrictions**: Git push limited to current working branch
- **Audit logging**: All operations logged for compliance
- **Automatic cleanup**: Sessions automatically terminated after completion

## Security Best Practices

### Working with Sensitive Code
- Review all suggested changes before approval
- Use project-specific permission settings
- Consider using [development containers](/docs/en/devcontainer) for isolation
- Regularly audit permission settings with `/permissions`

### Team Security
- Use [managed settings](/docs/en/iam#managed-settings) for organizational standards
- Share approved permission configurations through version control
- Train team members on security best practices
- Monitor usage through [OpenTelemetry metrics](/docs/en/monitoring-usage)

### Reporting Security Issues
1. Do not disclose vulnerabilities publicly
2. Report through [HackerOne program](https://hackerone.com/anthropic-vdp/reports/new?type=team&report_type=vulnerability)
3. Include detailed reproduction steps
4. Allow time for resolution before public disclosure

## Related Resources

- [Sandboxing](/docs/en/sandboxing) - Filesystem and network isolation
- [Identity and Access Management](/docs/en/iam) - Configure permissions
- [Monitoring usage](/docs/en/monitoring-usage) - Track activity
- [Development containers](/docs/en/devcontainer) - Secure environments
- [Anthropic Trust Center](https://trust.anthropic.com) - Certifications and compliance
