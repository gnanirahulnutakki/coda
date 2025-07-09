# Branch Protection Setup

This guide will help you set up branch protection rules for the main branch to address the security warning.

## Steps to Protect the Main Branch

1. **Navigate to Repository Settings**
   - Go to your repository on GitHub
   - Click on "Settings" tab
   - In the left sidebar, click on "Branches" under "Code and automation"

2. **Add Branch Protection Rule**
   - Click "Add rule" or "Add branch protection rule"
   - In the "Branch name pattern" field, enter: `main`

3. **Configure Protection Settings**

   ### Essential Settings (Recommended)
   - ✅ **Require a pull request before merging**
     - ✅ Require approvals: 1 (or more for larger teams)
     - ✅ Dismiss stale pull request approvals when new commits are pushed
     - ✅ Require review from CODEOWNERS (if you have a CODEOWNERS file)
   - ✅ **Require status checks to pass before merging**
     - ✅ Require branches to be up to date before merging
     - Select these status checks as required:
       - `test / test (18.x)`
       - `test / test (20.x)`
       - `test / test (22.x)`
       - `audit`
   - ✅ **Require conversation resolution before merging**
   - ✅ **Include administrators** (enforce rules for admins too)

   ### Additional Security Settings (Optional but Recommended)
   - ✅ **Require signed commits**
   - ✅ **Require linear history**
   - ✅ **Restrict who can push to matching branches**
     - Add specific users or teams who can push

   ### Force Push Protection
   - ✅ **Do not allow force pushes**
   - ✅ **Do not allow deletions**

4. **Save Changes**
   - Click "Create" or "Save changes" at the bottom of the page

## Verification

After setting up branch protection:

1. The warning message should disappear from your repository
2. Try creating a test PR to ensure the rules work as expected
3. Verify that direct pushes to main are blocked (except for allowed users if configured)

## For Solo Developers

If you're working alone and find the PR requirement too restrictive:

- You can still enable protection against force pushes and deletions
- Consider setting up a simplified rule that only prevents accidental branch deletion
- Minimum recommended settings:
  - ✅ Do not allow force pushes
  - ✅ Do not allow deletions
  - ✅ Require status checks to pass (CI/CD)

## Additional Security Recommendations

1. **Enable Dependabot**
   - Go to Settings → Security & analysis
   - Enable Dependabot alerts and security updates

2. **Set up Code Scanning**
   - Already configured via the security.yml workflow
   - Results will appear in the Security tab

3. **Configure Secret Scanning**
   - Go to Settings → Security & analysis
   - Enable secret scanning to prevent accidental credential commits
