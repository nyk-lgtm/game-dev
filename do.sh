#!/bin/bash
# usage: do.sh "cmd1" "cmd2" ...
D=$(dirname "$0"); rm -f "$D/out.txt"
printf '%s\n' "$@" > "$D/cmd.tmp" && mv "$D/cmd.tmp" "$D/cmd.txt"
for i in $(seq 1 1200); do [ -f "$D/out.txt" ] && grep -q DONE "$D/out.txt" && break; sleep 0.25; done
cat "$D/out.txt"
