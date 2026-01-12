---
source: https://code.claude.com/docs/en/sandboxing
fetched: 2026-01-12
---

# Sandboxing

## Overview

Claude Code features native sandboxing to provide a more secure environment for agent execution while reducing the need for constant permission prompts. Instead of asking permission for each bash command, sandboxing creates defined boundaries upfront where Claude Code can work more freely with reduced risk.

The sandboxed bash tool uses OS-level primitives to enforce both **filesystem and network isolation**.

## Why Sandboxing Matters

Traditional permission-based security requires constant user approval for bash commands, which can lead to:

- **Approval fatigue**: Repeatedly clicking "approve" reduces attention to what's being approved
- **Reduced productivity**: Constant interruptions slow down development workflows
- **Limited autonomy**: Claude Code cannot work efficiently while waiting for approvals

Sandboxing addresses these by:

1. **Defining clear boundaries**: Specify exactly which directories and network hosts Claude Code can access
2. **Reducing permission prompts**: Safe commands within the sandbox don't require approval
3. **Maintaining security**: Attempts to access resources outside the sandbox trigger immediate notifications
4. **Enabling autonomy**: Claude Code can run more independently within defined limits

**Important**: Effective sandboxing requires **both** filesystem and network isolation to prevent bypasses.

## How It Works

### Filesystem Isolation

- **Default writes behavior**: Read and write access to the current working directory and its subdirectories
- **Default read behavior**: Read access to the entire computer, except certain denied directories
- **Blocked access**: Cannot modify files outside the current working directory without explicit permission
- **Configurable**: Define custom allowed and denied paths through settings

### Network Isolation

- **Domain restrictions**: Only approved domains can be accessed
- **User confirmation**: New domain requests trigger permission prompts
- **Custom proxy support**: Advanced users can implement custom rules on outgoing traffic
- **Comprehensive coverage**: Restrictions apply to all scripts, programs, and subprocesses spawned by commands

### OS-Level Enforcement

- **Linux**: Uses [bubblewrap](https://github.com/containers/bubblewrap) for isolation
- **macOS**: Uses Seatbelt for sandbox enforcement

All child processes spawned by Claude Code's commands inherit the same security boundaries.

## Getting Started

### Enable Sandboxing

Run the `/sandbox` slash command:

```
> /sandbox
```

This opens a menu where you can choose between sandbox modes.

### Sandbox Modes

**Auto-allow mode**: Bash commands automatically execute inside the sandbox without requiring permission. Commands that cannot be sandboxed fall back to the regular permission flow. Explicit ask/deny rules are always respected.

**Regular permissions mode**: All bash commands go through the standard permission flow, even when sandboxed. This provides more control but requires more approvals.

### Configure Sandboxing

Customize sandbox behavior through your `settings.json` file. See [Settings](/docs/en/settings#sandbox-settings) for the complete configuration reference.

**Compatibility notes:**
- `watchman` is incompatible with sandboxing. Use `jest --no-watchman` instead
- `docker` is incompatible with sandboxing. Specify `docker` in `excludedCommands` to force it outside the sandbox
- Many CLI tools require network access to certain hosts—grant permission as needed

## Security Benefits

### Protection Against Prompt Injection

Even if an attacker manipulates Claude Code through prompt injection, the sandbox ensures:

**Filesystem protection:**
- Cannot modify critical config files like `~/.bashrc`
- Cannot modify system-level files in `/bin/`
- Cannot read files denied in your Claude permission settings

**Network protection:**
- Cannot exfiltrate data to attacker-controlled servers
- Cannot download malicious scripts from unauthorized domains
- Cannot make unexpected API calls to unapproved services
- Cannot contact domains not explicitly allowed

**Monitoring and control:**
- All access attempts outside the sandbox are blocked at the OS level
- You receive immediate notifications when boundaries are tested
- You can deny, allow once, or permanently update your configuration

### Reduced Attack Surface

Sandboxing limits damage from:
- Malicious dependencies (NPM packages, etc.)
- Compromised scripts and build tools
- Social engineering attacks
- Prompt injection attacks

## Security Limitations

- **Network Filtering**: The system restricts domains but doesn't inspect traffic. Only allow trusted domains. Broad domains like `github.com` could allow data exfiltration. [Domain fronting](https://en.wikipedia.org/wiki/Domain_fronting) may be possible in some cases.

- **Unix Sockets**: The `allowUnixSockets` configuration can grant access to powerful system services (e.g., `/var/run/docker.sock` grants host system access). Consider carefully what to allow.

- **Filesystem Permission Escalation**: Overly broad write permissions can enable privilege escalation. Avoid allowing writes to directories containing `$PATH` executables or shell config files (`.bashrc`, `.zshrc`).

- **Linux Nested Sandboxing**: The `enableWeakerNestedSandbox` mode weakens security for Docker compatibility. Only use when additional isolation is enforced.

## Advanced Usage

### Custom Proxy Configuration

Implement a custom proxy for:
- HTTPS traffic decryption and inspection
- Custom filtering rules
- Network request logging
- Existing security infrastructure integration

```json
{
  "sandbox": {
    "network": {
      "httpProxyPort": 8080,
      "socksProxyPort": 8081
    }
  }
}
```

### Integration with Existing Security Tools

- **IAM policies**: Combine with [permission settings](/docs/en/iam) for defense-in-depth
- **Development containers**: Use with [devcontainers](/docs/en/devcontainer) for additional isolation
- **Enterprise policies**: Enforce sandbox configurations through [managed settings](/docs/en/settings#settings-precedence)

## Best Practices

1. **Start restrictive**: Begin with minimal permissions and expand as needed
2. **Monitor logs**: Review sandbox violation attempts to understand Claude Code's needs
3. **Use environment-specific configs**: Different sandbox rules for development vs. production
4. **Combine with permissions**: Use sandboxing alongside IAM policies for comprehensive security
5. **Test configurations**: Verify your sandbox settings don't block legitimate workflows

## Open Source

The sandbox runtime is available as an npm package for use in your own agent projects:

```bash
npx @anthropic-ai/sandbox-runtime <command-to-sandbox>
```

For implementation details, visit the [GitHub repository](https://github.com/anthropic-experimental/sandbox-runtime).

## Limitations

- **Performance overhead**: Minimal, but some filesystem operations may be slightly slower
- **Compatibility**: Some tools requiring specific system access patterns may need configuration adjustments
- **Platform support**: Currently supports Linux and macOS; Windows support planned

## See Also

- [Security](/docs/en/security) - Comprehensive security features and best practices
- [IAM](/docs/en/iam) - Permission configuration and access control
- [Settings](/docs/en/settings) - Complete configuration reference
- [CLI reference](/docs/en/cli-reference) - Command-line options including `-sb`
