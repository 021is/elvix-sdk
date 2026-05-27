# Enabling signed-commit requirement on `main`

Branch protection on `main` supports requiring every commit to be cryptographically signed. We don't enforce this today — turning it on without first configuring `git` would lock you out of your own push workflow. Once your local git signs, flip it on.

## Why

Token-hijack attacks succeed when an attacker steals your GitHub credentials and pushes commits in your name. With signed commits required, the attacker would also need access to your SSH key + your passphrase, which generally don't live in the same place. Defence in depth, not a substitute for token hygiene.

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
