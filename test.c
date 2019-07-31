void fork();
void print(int);
int getpid();

int main() {
    print(42);
    fork();
    print(getpid());
}
