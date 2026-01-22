# Succession Planning: Charger Robotics 3786 Bot

**Version**: 1.1  
**Date**: January 2026  
**Purpose**: Ensure the bot survives mentor transitions and continues serving the team

---

## 0. POC vs Production: When This Document Applies

> ⚠️ **Important**: This document describes the **ideal end-state** for team ownership. If you're running in **POC Mode** (testing with personal accounts), you don't need to implement all of this yet.

| Phase | Account Strategy | This Document |
|-------|-----------------|---------------|
| **🧪 POC Mode** | Personal accounts | Reference only - implement later |
| **🏭 Production Mode** | Team-owned accounts | Full implementation required |

**When to apply this document:**
- ✅ Team has validated and adopted the bot
- ✅ Bot is considered "team infrastructure"
- ✅ Multiple people need ongoing access

**POC-to-Production Migration**: See [Section 8](#8-poc-to-production-migration-checklist) for the migration checklist.

---

## 1. The Problem

FRC teams are volunteer-run organizations with natural turnover:
- Mentors move, change jobs, or step back
- Students graduate every 4 years
- "Bus factor" is often 1 (one person holds all the keys)

**Goal**: No single person's departure should break the bot or lock out the team.

---

## 2. Account Ownership Strategy

### 2.1 The Golden Rule (For Production)

> **Never tie critical infrastructure to a personal account.**

⚠️ **Note**: This rule applies to **production deployments**. For POC/testing, personal accounts are acceptable and even preferred to reduce team burden.

| Phase | Acceptable | Recommended |
|-------|------------|-------------|
| **🧪 POC** | `john@gmail.com` (your account) | Test quickly, discard if unwanted |
| **🏭 Production** | ❌ Personal accounts | `tech@chargerrobotics.org` (team-owned) |

**Production Best Practices:**

| ❌ Bad Practice | ✅ Good Practice |
|-----------------|------------------|
| OAuth app under `john@gmail.com` | OAuth app under `tech@chargerrobotics.org` |
| GitLab PAT from mentor's account | GitLab Group Access Token (not tied to user) |
| Cloudflare under personal email | Cloudflare under team email with 2+ admins |
| Secrets only in one person's head | Secrets in team password manager |

### 2.2 Required Team Accounts

Create these **team-owned** accounts before deploying:

| Service | Account Email | Purpose | Min Admins |
|---------|---------------|---------|------------|
| **Cloudflare** | tech@chargerrobotics.org | Hosting, DNS | 2 |
| **Atlassian Developer** | tech@chargerrobotics.org | OAuth app | 2 |
| **GitLab** (if self-managed) | tech@chargerrobotics.org | Admin account | 2 |
| **GitHub** (code repo) | Team organization | Code repository | 3 |
| **Password Manager** | Team vault | Shared secrets | 2 |

### 2.3 Email Setup

The `tech@chargerrobotics.org` (or similar) should be:
- A **group alias** that forwards to multiple mentors
- Not a personal email with forwarding
- Updated when mentors change
- Able to receive password resets

**Example Google Workspace Setup**:
```
tech@chargerrobotics.org → Group
  Members:
    - mentor1@gmail.com
    - mentor2@gmail.com
    - head-coach@school.edu
```

---

## 3. Service-Specific Succession

### 3.1 Cloudflare

**Setup**:
1. Create Cloudflare account with team email
2. Add 2+ mentors as Super Administrators
3. Enable 2FA for all admin accounts
4. Document account in password manager

**On Mentor Departure**:
1. Remove departing mentor from account
2. Rotate any API tokens they had access to
3. Add new mentor if needed
4. Update password manager

**Recovery Plan**:
- If locked out: Contact Cloudflare support with domain ownership proof
- Keep backup admin contact current

### 3.2 Atlassian (Jira/Confluence OAuth)

**Setup**:
1. Create Atlassian Developer account with team email: https://developer.atlassian.com/
2. Register OAuth 2.0 (3LO) app under this account
3. Add 2+ mentors to the Atlassian organization
4. Document client ID/secret in password manager

**Critical Settings**:
```
OAuth App Name: Charger Robotics Slack Bot
Callback URL: https://bot.chargerrobotics.org/oauth/atlassian/callback
Scopes: read:jira-work, write:jira-work, read:confluence-content.all, etc.
```

**On Mentor Departure**:
1. Remove from Atlassian organization
2. Do NOT rotate OAuth client secret (breaks all user tokens)
3. Only rotate if compromised

**Token Refresh Strategy**:
- User tokens have refresh tokens (90-day expiry if unused)
- Bot should auto-refresh before expiry
- Alert if refresh fails (user needs to re-authorize)

### 3.3 GitLab

**Recommended: Group Access Tokens** (Preferred)

| Method | Tied to Person? | Survives Departure? | Tier Required |
|--------|-----------------|---------------------|---------------|
| Personal Access Token | ✅ Yes | ❌ No | Free |
| Group Access Token | ❌ No | ✅ Yes | Premium |
| Project Access Token | ❌ No | ✅ Yes | Premium |
| Deploy Token | ❌ No | ✅ Yes | Free (read-only) |

**If Team Has GitLab Premium/Ultimate**:
1. Create Group Access Token at group level
2. Scope: `read_api`, `read_repository`
3. Set expiration to 365 days
4. Document in password manager
5. Set calendar reminder for rotation

**If Team Has GitLab Free**:
- Option A: Use Deploy Token (read-only, limited functionality)
- Option B: Create dedicated "bot" user account (with team email)
- Option C: Use OAuth 2.0 with team-owned GitLab application

**Token Expiry Handling**:
- GitLab sends email notifications at 60/30/7 days before expiry
- Bot should check token validity on startup
- Alert mentors if token expires

### 3.4 Slack Workspace

**Setup**:
1. Install bot to workspace as Workspace Admin
2. Bot tokens don't expire (until revoked)
3. Multiple Workspace Admins should exist

**On Mentor Departure**:
1. Remove from Workspace Admins if needed
2. Bot continues working (not tied to individual)

### 3.5 GitHub (Code Repository)

**Setup**:
1. Create organization: `charger-robotics` (or use existing)
2. Add repository under organization
3. Multiple organization owners
4. Branch protection on `main`

**On Mentor Departure**:
1. Remove from organization
2. Code and history preserved
3. New mentors can be added

---

## 4. Secret Management

### 4.1 What Needs to Be Stored

| Secret | Where Used | Rotation Frequency |
|--------|------------|-------------------|
| Slack Signing Secret | Webhook verification | On compromise only |
| Slack Bot Token | API calls | On compromise only |
| Atlassian Client ID | OAuth identification | Never (public) |
| Atlassian Client Secret | OAuth token exchange | Annually / on compromise |
| GitLab Group Token | API calls | Annually (max 365 days) |
| D1 Encryption Key | Data at rest | On compromise only |

### 4.2 Password Manager Setup

**Recommended**: Team-compatible password manager
- **Bitwarden Teams** ($4/user/month) - Excellent for teams
- **1Password Teams** ($7.99/user/month) - Popular choice
- **LastPass Teams** - Another option

**Vault Structure**:
```
Charger Robotics Vault/
├── Slack Bot/
│   ├── Signing Secret
│   ├── Bot Token
│   └── App Credentials
├── Atlassian/
│   ├── Developer Account Login
│   ├── OAuth Client ID
│   └── OAuth Client Secret
├── GitLab/
│   ├── Group Access Token
│   └── Token Expiry Date (note)
├── Cloudflare/
│   ├── Account Login
│   └── API Token (if used)
└── Recovery/
    ├── Backup codes (all services)
    └── Recovery email access
```

### 4.3 Access Control

| Role | Vault Access |
|------|--------------|
| Lead Mentor(s) | Full access |
| Technical Mentor(s) | Full access |
| Other Mentors | Read access (as needed) |
| Students | No access |

---

## 5. Documentation Requirements

### 5.1 Required Documentation

Create and maintain these documents:

| Document | Location | Purpose |
|----------|----------|---------|
| `docs/setup.md` | Repository | Initial setup instructions |
| `docs/deployment.md` | Repository | How to deploy/update |
| `docs/admin-guide.md` | Repository | Day-to-day administration |
| `docs/troubleshooting.md` | Repository | Common issues and fixes |
| `docs/succession-planning.md` | Repository | This document |
| `CONTRIBUTING.md` | Repository | How to contribute code |
| Password Manager Notes | Password Manager | Account-specific details |

### 5.2 Documentation Checklist

Before considering the bot "production ready":

- [ ] Setup guide tested by someone who didn't build it
- [ ] All secrets documented in password manager
- [ ] At least 2 people can deploy updates
- [ ] At least 2 people can access all service accounts
- [ ] Credential rotation dates calendared
- [ ] Recovery procedures documented and tested

---

## 6. Handoff Procedures

### 6.1 Adding a New Technical Mentor

**Checklist**:
1. [ ] Add to team email group (tech@...)
2. [ ] Add to password manager vault
3. [ ] Add as admin on Cloudflare
4. [ ] Add to Atlassian organization
5. [ ] Add as GitLab group owner/maintainer
6. [ ] Add as GitHub org member
7. [ ] Add as Slack Workspace Admin (if appropriate)
8. [ ] Walk through documentation together
9. [ ] Verify they can deploy an update
10. [ ] Update succession contacts list

### 6.2 Mentor Departure Checklist

**When a technical mentor leaves**:
1. [ ] Thank them for their service! 🎉
2. [ ] Remove from team email group
3. [ ] Remove from password manager vault
4. [ ] Remove from Cloudflare account
5. [ ] Remove from Atlassian organization
6. [ ] Remove from GitLab group
7. [ ] Remove from GitHub organization
8. [ ] Remove as Slack Workspace Admin
9. [ ] **Do NOT rotate OAuth secrets** (breaks user tokens)
10. [ ] Review: Do we still have 2+ admins everywhere?
11. [ ] Update succession contacts list

### 6.3 Emergency Recovery

**If locked out of a service**:

| Service | Recovery Steps |
|---------|----------------|
| Cloudflare | Contact support with domain ownership proof |
| Atlassian | Contact support with organization proof |
| GitLab | Contact support / use backup admin |
| GitHub | Organization owners can recover |
| Password Manager | Use emergency kit / backup codes |

**Prevention**:
- Store backup codes in a **physical** secure location
- Have at least one mentor with full emergency access
- Test recovery procedures annually

---

## 7. Annual Review Process

### 7.1 Yearly Checklist (Do in August)

Before each FRC season:

1. [ ] **Access Audit**: Verify all account admins are current team members
2. [ ] **Token Rotation**: Rotate GitLab token (365-day max)
3. [ ] **Documentation Review**: Update any outdated docs
4. [ ] **Succession Test**: Have a non-primary mentor deploy an update
5. [ ] **Password Manager Audit**: Remove departed members' access
6. [ ] **Contact Update**: Update emergency contact list
7. [ ] **Recovery Test**: Verify backup codes still work

### 7.2 Succession Contacts

**Maintain a list of people who can help**:

| Role | Name | Contact | Access Level |
|------|------|---------|--------------|
| Primary Technical | [Name] | [Email/Phone] | Full |
| Backup Technical | [Name] | [Email/Phone] | Full |
| Team Coach | [Name] | [Email/Phone] | Password Manager |
| School Contact | [Name] | [Email/Phone] | Emergency |

---

## 8. Worst-Case Scenarios

### 8.1 "Everyone is locked out"

1. Check if school/sponsor can verify team ownership
2. Contact service support with incorporation/team documents
3. May need to recreate accounts from scratch
4. This is why we document EVERYTHING

### 8.2 "The only person who understands the bot left"

1. All code is in GitHub (open, documented)
2. Architecture docs explain how it works
3. Setup guide enables recreation
4. Consider reaching out to other FRC teams for help

### 8.3 "Credentials were compromised"

1. **Immediately** rotate affected credentials
2. Revoke all user OAuth tokens (users re-authorize)
3. Check audit logs for unauthorized access
4. Notify team of temporary outage
5. Document incident and update procedures

---

## 9. POC-to-Production Migration Checklist

When the team decides to adopt the bot, migrate from personal accounts to team ownership:

### Phase 1: Create Team Accounts

- [ ] Create team email alias (e.g., `tech@chargerrobotics.org`)
- [ ] Add 2+ mentors to email alias
- [ ] Create Cloudflare account with team email
- [ ] Create Atlassian Developer account with team email
- [ ] Set up team password manager

### Phase 2: Recreate Resources Under Team Account

- [ ] In new Cloudflare account:
  - [ ] Create KV namespace
  - [ ] Create D1 database
  - [ ] Create Queue
- [ ] In new Atlassian Developer account:
  - [ ] Create new OAuth app with same scopes
  - [ ] Update callback URL
- [ ] Create GitLab Group Access Token (if applicable)

### Phase 3: Migrate Data & Deploy

- [ ] Export data from POC D1 database (if needed)
- [ ] Import data to production D1 database
- [ ] Update `wrangler.toml` with new resource IDs
- [ ] Set secrets in new Cloudflare account
- [ ] Deploy to new account

### Phase 4: Update Integrations

- [ ] Update Slack app URLs to new Worker domain
- [ ] Users will need to re-authorize Atlassian (new OAuth app)
- [ ] Test all functionality

### Phase 5: Cleanup

- [ ] Delete old Worker from personal Cloudflare
- [ ] Document new accounts in password manager
- [ ] Schedule credential rotation reminders

> 💡 **Tip**: The migration is essentially "do the setup guide again" but with team accounts. The bot code doesn't change.

---

## 10. Summary Checklist

**Before Launch (Production)**:

- [ ] Team email alias created and forwarding to 2+ mentors
- [ ] All service accounts use team email
- [ ] 2+ admins on every service
- [ ] Password manager set up with all secrets
- [ ] Documentation complete and tested
- [ ] At least 2 people can deploy updates
- [ ] Annual review process calendared

**This document should be reviewed and updated whenever**:

- A mentor joins or leaves
- A new service is added
- An account recovery is needed
- Annually (at minimum)

---

## Appendix: Quick Reference

### Service Account Checklist

| Service | Team Email? | 2+ Admins? | In Password Manager? |
|---------|-------------|------------|---------------------|
| Cloudflare | ☐ | ☐ | ☐ |
| Atlassian Developer | ☐ | ☐ | ☐ |
| GitLab | ☐ | ☐ | ☐ |
| GitHub Org | ☐ | ☐ | ☐ |
| Slack Workspace | ☐ | ☐ | ☐ |
| Password Manager | ☐ | ☐ | N/A |

### Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Primary Technical | _____ | _____ | _____ |
| Backup Technical | _____ | _____ | _____ |
| Team Coach | _____ | _____ | _____ |
| School Contact | _____ | _____ | _____ |
