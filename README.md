# dl

> DownLoader of code/repos/packages/orgs into the archive

A cli utility (in node.js+gunshi) for downloading from code/repos/packages/orgs

# usage

simple, non-interactive ways to download things:

```sh
# dl into ~/archive/rektide/dl
dl rektide/dl
# dl repo into ~/archive/pipewire/pipewire-native-rs
dl https://gitlab.freedesktop.org/pipewire/pipewire-native-rs
# dl from github into ~/archive/mary-ext/atcute
dl mary-ext/atcute
# dl from tangled into ~/archive/pds.ls/pdsls
dl pds.ls/pdsls
# download npm package into ~/archive/kazupon/gunshi
dl gunshi
# download from crate into ~/archive/lmmx/figment2
dl figments2
```

interactive repo picker:

```sh
dl --org rektide --pick
```
