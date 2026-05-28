# Signed commits — deliberately NOT enforced (yet)

Branch protection on `main` *can* require every commit to be cryptographically signed. We have decided **not** to enforce it while this is a solo-maintainer repo. This file is the playbook for when that changes.

## When to turn this on

- More than one person can push / merge.
- The package becomes a named supply-chain target (high download count, used by other published packages).

Until then it's friction without payoff: the realistic threats here (malicious PR, hijacked dependency) are already handled by branch protection + review-gated merges + dependency exact-pins + npm provenance. Signed commits address neither, and they risk locking you out the first time you commit from a machine that isn't configured.

## Why it matters once you scale

Token-hijack attacks succeed when an attacker steals GitHub credentials and pushes commits in a maintainer's name. With signed commits required, the attacker would also need the SSH key + passphrase, which generally don't live in the same place. Defence in depth — only worth the friction once there's more than one key holder.

## Set it up (SSH signing, simplest path)

```bash
# Use the same SSH key you already use for `git push`.
git config --global user.signingkey "$(ssh-add -L | head -1)"
git config --global gpg.format ssh
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# One-time: tell git which key fingerprints GitHub trusts.
mkdir -p ~/.config/git
ssh-add -L | awk '{print $1 " " $2}' > ~/.config/git/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
```

Verify on the next commit:

```bash
git commit --allow-empty -m "signed test"
git log -1 --show-signature
# Expected: "Good "git" signature for ..."
```

## Then flip it on for the repo

```bash
gh api -X POST /repos/021is/elvix-sdk/branches/main/protection/required_signatures
```

After that, any unsigned push to `main` rejects with `commit X cannot be merged because it has no verified signature`.

## To turn it off (rollback)

```bash
gh api -X DELETE /repos/021is/elvix-sdk/branches/main/protection/required_signatures
```
